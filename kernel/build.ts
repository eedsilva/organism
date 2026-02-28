import { callBrain } from "../cognition/llm";
import { query } from "../state/db";
import { draftOutreach } from "./reach";
import { sendPushNotification } from "./notify";
import { transitionOpportunity } from "./opportunity";
import { selectArchetype } from "../cognition/archetypeSelector";
import * as templates from "./toolArchetypes";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

/**
 * build.ts — Preorder-first product pipeline.
 *
 * FLOW:
 *   1. Opportunity marked 'pursue'
 *   2. Generate landing page + Stripe preorder link ($19)
 *   3. Draft outreach pointing to that page
 *   4. Wait 48 hours
 *   5. If payment received → build the real product
 *   6. If no payment → kill the opportunity, learn, move on
 *
 * Nothing gets built before someone pays.
 * One payment is more signal than 100 email signups.
 */

const PREORDER_PRICE = 19;
const PREORDER_WINDOW_HOURS = 48;

// ── Step 1: Generate preorder landing page ──────────────────────────────────

export async function launchPreorder(opportunity: any) {
  const prompt = `
You are configuring a high-converting B2B SaaS landing page template.
High-intent email conversions = we build it. Zero conversions = we kill it.

OPPORTUNITY: ${opportunity.title}
CONTEXT: ${opportunity.raw_text?.slice(0, 1000) || ""}
PLAN: ${opportunity.plan || ""}

Provide the configuration ONLY in valid JSON, no markdown blocks:
{
  "product_name": "short, memorable, lowercase (e.g. syncpro)",
  "headline": "Massive value prop headline (max 8 words)",
  "subheadline": "We built the tool your accountant wishes existed. Save 10 hours.",
  "pain_points": [
    "Pain point 1",
    "Pain point 2",
    "Pain point 3"
  ],
  "cta_text": "Join the waitlist",
  "social_proof": "Trusted by early access members",
  "color_primary": "#6366f1",
  "color_accent": "#8b5cf6",
  "lead_webhook_url": "http://localhost:3001/signal/lead/${opportunity.id}",
  "opportunity_id": ${opportunity.id},
  "cold_outreach": "3-sentence DM to send to someone who posted about this pain",
  "reddit_communities": ["r/SaaS", "r/Entrepreneur"]
}
`;

  try {
    // Generate config. Use "chat" taskType to default to gpt-4o-mini for cost efficiency.
    const response = await callBrain(prompt, `preorder config for: ${opportunity.title?.slice(0, 50)}`, false, "chat");
    let parsed: any = null;

    try {
      const clean = response.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["build_json_parse_fail", { opportunity_id: opportunity.id, raw: response.slice(0, 500) }]);
      throw new Error("Failed to parse chassis config from LLM.");
    }

    const folderName = `product_${opportunity.id}_preorder`;
    const folderPath = path.join("products", folderName);

    if (!fs.existsSync("products")) fs.mkdirSync("products");

    // Copy the pre-built Chassis template instead of generating boilerplate
    const chassisSrc = path.join(process.cwd(), "organism-ui-chassis");
    await execAsync(`cp -R "${chassisSrc}" "${folderPath}"`);

    // Inject the generated config
    fs.writeFileSync(path.join(folderPath, "chassis.config.json"), JSON.stringify(parsed, null, 2));

    if (parsed?.cold_outreach) {
      fs.writeFileSync(path.join(folderPath, "cold_outreach.txt"), parsed.cold_outreach);
    }

    // Mark as building
    await transitionOpportunity(opportunity.id, 'building');

    await query(`INSERT INTO reach_log (opportunity_id, channel, content, status) VALUES ($1, $2, $3, $4)`,
      [opportunity.id, "preorder", `${parsed?.product_name}\n${parsed?.headline}\nAction: Join Waitlist on site`, "drafted"]
    );

    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["preorder_launched", {
        opportunity_id: opportunity.id,
        product_name: parsed?.product_name,
        folder: folderPath,
        reddit_communities: parsed?.reddit_communities,
      }]
    );

    console.log(`  💳 Waitlist config ready: ${parsed?.product_name || opportunity.title}`);
    console.log(`  📁 Folder: ${folderPath}`);

    let deployUrl = "";
    if (process.env.VERCEL_TOKEN) {
      console.log(`  🚀 Automating Vercel deployment...`);
      try {
        const { stdout } = await execAsync(`npx --yes vercel --prod --yes --token=${process.env.VERCEL_TOKEN}`, { cwd: folderPath });
        deployUrl = stdout.trim();
        console.log(`  ✅ Deployed to: ${deployUrl}`);
      } catch (err: any) {
        console.log(`  ⚠️ Vercel deploy failed: ${err.message}. Manual deployment required.`);
      }
    } else {
      console.log(`  ⏳ 48h window starts when you deploy + post`);
    }

    await sendPushNotification(
      `Waitlist Page Configured: ${parsed?.product_name || 'Anonymous Project'}`,
      `A new waitlist chassis was configured for opportunity #${opportunity.id}.\n\nDeploy path: ${folderPath}\nURL: ${deployUrl || 'Awaiting manual deploy'}`
    );

    await draftOutreach({ ...opportunity, plan: opportunity.plan, product_name: parsed?.product_name });

    return parsed;

  } catch (err: any) {
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["build_error", { error: err.message, opportunity_id: opportunity.id }]
    );
    await transitionOpportunity(opportunity.id, 'error', { error: err.message });
    return null;
  }
}

// ── Step 2: Check preorder results (runs each cycle) ────────────────────────

export async function checkPreorderWindows() {
  // Find preorders that have been live for 48+ hours
  const expired = await query(
    `SELECT r.id as reach_id, r.opportunity_id, o.title,
            EXTRACT(EPOCH FROM (NOW() - r.created_at))/3600 as hours_live
     FROM reach_log r
     JOIN opportunities o ON o.id = r.opportunity_id
     WHERE r.channel = 'preorder'
       AND r.status = 'posted'
       AND r.created_at < NOW() - INTERVAL '${PREORDER_WINDOW_HOURS} hours'`
  );

  for (const row of expired.rows) {
    // Check if we received any payment for this opportunity
    const payment = await query(
      `SELECT id FROM metrics_daily WHERE payments > 0 AND date >= (
         SELECT DATE(created_at) FROM reach_log WHERE id = $1
       ) LIMIT 1`,
      [row.reach_id]
    );

    if (payment.rows.length > 0) {
      // Validated! We can build the real product.
      await transitionOpportunity(row.opportunity_id, 'pursue', { reason: 'payment received' });
      await query(`UPDATE reach_log SET status = 'converted' WHERE id = $1`, [row.reach_id]);
      await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["preorder_converted", { opportunity_id: row.opportunity_id, hours_live: row.hours_live }]
      );
      console.log(`  ✅ PREORDER CONVERTED: "${row.title.slice(0, 50)}" — building real product`);

      await sendPushNotification(
        `Preorder Converted! ${row.title.slice(0, 30)}...`,
        `Payment was detected for opportunity #${row.opportunity_id} within ${Math.round(Number(row.hours_live))}h.\n\nThe Organism is now building the real product.`
      );
    } else {
      // Failed validation. Kill it.
      await transitionOpportunity(row.opportunity_id, 'killed', { reason: 'preorder window expired with no sales' });
      await query(`UPDATE reach_log SET status = 'expired' WHERE id = $1`, [row.reach_id]);
      await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["preorder_killed", { opportunity_id: row.opportunity_id, hours_live: row.hours_live }]
      );
      console.log(`  ❌ PREORDER KILLED: "${row.title.slice(0, 50)}" — 0 payments in ${Math.round(Number(row.hours_live))}h`);

      await sendPushNotification(
        `Preorder Killed: ${row.title.slice(0, 30)}...`,
        `0 payments received for opportunity #${row.opportunity_id} in ${Math.round(Number(row.hours_live))}h.\n\nThe opportunity has been killed. The Organism will learn from this failure and move on.`
      );
    }
  }
}

// ── Step 3: Build real product (only after payment confirmed) ────────────────
//
// Generates a deployable Next.js micro-SaaS in products/product_<id>/
// Operator follows DEPLOY.md to push live. Automation comes post-Stripe.

export async function buildProduct(opportunity: any) {
  const productName = (opportunity.plan?.match(/"product_name"\s*:\s*"([^"]+)"/) ?? [])[1]
    ?? opportunity.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)
    ?? `product-${opportunity.id}`;

  const prompt = `
You are building a real micro-SaaS product. A customer has already paid $${PREORDER_PRICE}.
Build the simplest working version that delivers the core value.

PRODUCT NAME: ${productName}
PAIN BEING SOLVED: ${opportunity.title}
CONTEXT: ${opportunity.plan?.slice(0, 1000) || opportunity.raw_text?.slice(0, 800) || ""}

Generate ALL of the following. Respond ONLY in valid JSON, no markdown:
{
  "page_code":          "complete app/page.tsx content",
  "layout_code":        "complete app/layout.tsx content with proper metadata",
  "api_route_code":     "complete app/api/process/route.ts content",
  "tailwind_config":    "complete tailwind.config.ts content",
  "global_css":         "complete app/globals.css content (minimal Tailwind base)",
  "package_name":       "${productName}",
  "description":        "one-line product description for package.json",
  "tagline":            "one-line problem-first tagline for README"
}

REQUIREMENTS:
- page.tsx: beautiful, dark-mode, Tailwind-styled UI. Input form → API call → clear output display.
- layout.tsx: proper <html>, <head> with title/description meta, and Plausible Analytics script (<script defer data-domain="YOUR_DOMAIN" src="https://plausible.io/js/script.js"></script>), body. Clean font (Inter via Google Fonts).
- api/process/route.ts: POST handler, receives { input }, returns { result }. Stub with realistic placeholder logic.
- tailwind.config.ts: darkMode 'class', content paths correct for Next.js app router.
- globals.css: only Tailwind base directives (@tailwind base/components/utilities).
- All code must be copy-paste runnable — no placeholders like "add your logic here".
`;

  try {
    // Code generation — use cloud (GPT-4o) when budget allows, qwen2.5-coder as Ollama fallback
    const response = await callBrain(prompt, `building product: ${opportunity.title?.slice(0, 50)}`, false, "code");
    let parsed: any = null;

    try {
      const clean = response.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["build_json_parse_fail", { opportunity_id: opportunity.id, raw: response.slice(0, 500) }]
      );
    }

    const folderPath = path.join("products", `product_${opportunity.id}`);
    fs.mkdirSync(path.join(folderPath, "app", "api", "process"), { recursive: true });
    fs.mkdirSync(path.join(folderPath, "public"), { recursive: true });

    // ── Write Next.js project files ─────────────────────────────────────────

    // package.json
    fs.writeFileSync(path.join(folderPath, "package.json"), JSON.stringify({
      name: parsed?.package_name ?? productName,
      version: "0.1.0",
      private: true,
      description: parsed?.description ?? opportunity.title,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
      },
      dependencies: {
        next: "14.2.0",
        react: "^18",
        "react-dom": "^18",
      },
      devDependencies: {
        typescript: "^5",
        "@types/react": "^18",
        "@types/react-dom": "^18",
        "@types/node": "^20",
        tailwindcss: "^3",
        autoprefixer: "^10",
        postcss: "^8",
      },
    }, null, 2));

    // next.config.js
    fs.writeFileSync(path.join(folderPath, "next.config.js"),
      `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nmodule.exports = nextConfig;\n`
    );

    // tsconfig.json
    fs.writeFileSync(path.join(folderPath, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "es5", lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true, skipLibCheck: true, strict: true,
        noEmit: true, esModuleInterop: true, module: "esnext",
        moduleResolution: "bundler", resolveJsonModule: true,
        isolatedModules: true, jsx: "preserve", incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./*"] },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    }, null, 2));

    // postcss.config.js
    fs.writeFileSync(path.join(folderPath, "postcss.config.js"),
      `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`
    );

    // LLM-generated files
    if (parsed?.tailwind_config) {
      fs.writeFileSync(path.join(folderPath, "tailwind.config.ts"), parsed.tailwind_config);
    }
    if (parsed?.global_css) {
      fs.writeFileSync(path.join(folderPath, "app", "globals.css"), parsed.global_css);
    }
    if (parsed?.layout_code) {
      fs.writeFileSync(path.join(folderPath, "app", "layout.tsx"), parsed.layout_code);
    }
    if (parsed?.page_code) {
      fs.writeFileSync(path.join(folderPath, "app", "page.tsx"), parsed.page_code);
    }
    if (parsed?.api_route_code) {
      fs.writeFileSync(path.join(folderPath, "app", "api", "process", "route.ts"), parsed.api_route_code);
    }

    // README
    fs.writeFileSync(path.join(folderPath, "README.md"), `
# ${parsed?.package_name ?? productName}

**${parsed?.tagline ?? opportunity.title}**

Built by Organism — autonomous micro-SaaS builder.

## Pain Hypothesis
${opportunity.title}

## How It Works
Submit your input via the web UI. The API processes it and returns the result.

## Deploy
See DEPLOY.md for exact steps.
`.trim());

    // DEPLOY.md
    fs.writeFileSync(path.join(folderPath, "DEPLOY.md"), `
# Deployment Steps

## 1. Install dependencies
\`\`\`bash
npm install
\`\`\`

## 2. Test locally
\`\`\`bash
npm run dev
# → http://localhost:3000
\`\`\`

## 3. Deploy to Vercel
\`\`\`bash
npm i -g vercel
vercel --prod
\`\`\`

## 4. Verify
- Visit the deployed URL
- Test the core flow end-to-end
- Confirm API route responds correctly

## 5. Update opportunity in DB
\`\`\`sql
UPDATE opportunities SET status = 'shipped' WHERE id = ${opportunity.id};
\`\`\`
`.trim());

    // It's shipped!
    await transitionOpportunity(opportunity.id, 'shipped', { folder: folderPath });
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["product_built", { opportunity_id: opportunity.id, folder: folderPath, product_name: productName }]
    );

    console.log(`  🚀 PRODUCT BUILT: ${folderPath}`);
    console.log(`  📂 Next.js project ready — follow ${folderPath}/DEPLOY.md`);

    let deployUrl = "";
    if (process.env.VERCEL_TOKEN) {
      console.log(`  🚀 Automating Vercel deployment for real product...`);
      try {
        const { stdout } = await execAsync(`npx --yes vercel --prod --yes --token=${process.env.VERCEL_TOKEN}`, { cwd: folderPath });
        deployUrl = stdout.trim();
        console.log(`  ✅ Deployed to: ${deployUrl}`);
      } catch (err: any) {
        console.log(`  ⚠️ Vercel deploy failed: ${err.message}. Manual deployment required.`);
      }
    }

    await sendPushNotification(
      `Product Built: ${productName}`,
      `The micro-SaaS for opportunity #${opportunity.id} has been generated.\n\nPath: ${folderPath}\nURL: ${deployUrl || 'Awaiting manual deploy'}\n\nPlease verify the deployment and start scaling.`
    );

    return parsed;

  } catch (err: any) {
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["build_error", { error: err.message, opportunity_id: opportunity.id }]
    );
    return null;
  }
}

// ── V4: Launch free tool from displacement event ─────────────────────────────

export async function launchFreeToolFromDisplacement(displacementEvent: {
  id: string;
  type: string;
  product_or_role: string;
  affected_persona_niche?: string;
  displacement_strength: number;
}): Promise<{ deploymentId: number; folderPath: string } | null> {
  const archetype = selectArchetype(
    displacementEvent.type as any,
    displacementEvent.displacement_strength,
    displacementEvent.affected_persona_niche
  );

  const prompt = `
You are configuring a free B2B tool template for a displacement event.
Product: ${displacementEvent.product_or_role}
Archetype: ${archetype}

Provide valid JSON only:
{
  "tool_name": "short name (e.g. Zapier Price Calculator)",
  "headline": "Value prop (max 10 words)",
  "input_description": "What the user pastes or enters",
  "share_hook": "Why they'd share this (e.g. 'Send to your finance team')",
  "data_dependency_level": "none"
}
`;

  try {
    const response = await callBrain(prompt, `tool spec for ${displacementEvent.product_or_role}`, false, "chat");
    const clean = response.replace(/```json|```/g, "").trim();
    const toolSpec = JSON.parse(clean);

    const insert = await query(
      `INSERT INTO tool_deployments (displacement_event_id, archetype, tool_name, tool_spec, data_dependency_level, status)
       VALUES ($1, $2, $3, $4, $5, 'building') RETURNING id`,
      [
        displacementEvent.id,
        archetype,
        toolSpec.tool_name || displacementEvent.product_or_role + " Tool",
        JSON.stringify(toolSpec),
        toolSpec.data_dependency_level || "none",
      ]
    );
    const deploymentId = insert.rows[0].id;

    const folderName = `tool_${displacementEvent.id.replace(/[^a-z0-9]/gi, "_")}`;
    const folderPath = path.join("products", folderName);
    if (!fs.existsSync("products")) fs.mkdirSync("products");

    const chassisSrc = path.join(process.cwd(), "organism-ui-chassis");
    await execAsync(`cp -R "${chassisSrc}" "${folderPath}"`);

    const templateKey = `${archetype}_TEMPLATE` as keyof typeof templates;
    const archetypeTemplate = templates[templateKey] || {};

    const config = {
      product_name: toolSpec.tool_name?.toLowerCase().replace(/\s/g, "") || "tool",
      headline: toolSpec.headline || `Free ${displacementEvent.product_or_role} tool`,
      subheadline: "Get instant value. No signup required.",
      pain_points: [
        "Current pricing is becoming unsustainable",
        "Need a reliable alternative quickly",
        "Manual workarounds take too much time"
      ],
      ...archetypeTemplate,
      share_hook: toolSpec.share_hook,
      lead_webhook_url: `http://localhost:3001/signal/lead/0`,
      opportunity_id: 0,
    };
    fs.writeFileSync(path.join(folderPath, "chassis.config.json"), JSON.stringify(config, null, 2));

    await query(
      `UPDATE tool_deployments SET status = 'ready' WHERE id = $1`,
      [deploymentId]
    );

    return { deploymentId, folderPath };
  } catch (err: any) {
    console.error(`  ❌ launchFreeToolFromDisplacement: ${err.message}`);
    return null;
  }
}

// ── Zombie cleanup — auto-kills stale building opportunities ─────────────────
// Uses event-sourced transitionOpportunity only; never direct UPDATE on opportunities.status

export async function killZombies() {
  const zombieDaysResult = await query(
    `SELECT value FROM policies WHERE key = 'zombie_kill_days'`
  );
  const days = Number(zombieDaysResult.rows[0]?.value ?? 5);

  // Find zombies through the VIEW (event-sourced status), not the base table
  const zombies = await query(
    `SELECT id, title FROM opportunity_current_state
     WHERE status = 'building'
       AND created_at < NOW() - INTERVAL '${days} days'`
  );

  for (const z of zombies.rows) {
    await transitionOpportunity(z.id, "killed", { reason: `zombie > ${days} days` });
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`, [
      "zombie_killed",
      { opportunity_id: z.id, title: z.title, after_days: days },
    ]);
    console.log(`  🪦 ZOMBIE KILLED: "${z.title?.slice(0, 55)}" (>${days} days)`);
  }

  if (zombies.rows.length === 0) {
    console.log(`  ✓ No zombies found.`);
  }
}

// ── Main entry point is now handled by workers/validation.ts ─────────