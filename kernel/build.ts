import { callLocalBrain } from "../cognition/llm";
import { query } from "../state/db";
import { draftOutreach } from "./reach";
import fs from "fs";
import path from "path";

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
You are building a minimal landing page for a $${PREORDER_PRICE} preorder to validate a product idea.
One payment in 48 hours = we build it. Zero payments = we kill it.

OPPORTUNITY: ${opportunity.title}
CONTEXT: ${opportunity.raw_text?.slice(0, 1000) || ""}
PLAN: ${opportunity.plan || ""}

Generate a complete single-file HTML landing page. Requirements:
- Headline: the specific pain solved (not the product name)
- 3 bullet points: concrete benefits, not features
- Social proof placeholder: "Join [X] early members"
- Price: "Early access — $${PREORDER_PRICE} one-time, then $39/month"
- CTA button: links to STRIPE_PAYMENT_LINK (placeholder)
- Simple inline CSS, dark background, high contrast — looks credible
- One short paragraph: "Built by an indie developer. If we don't hit 10 preorders in 48 hours, you get a full refund."
- Footer: "Questions? Reply to this post."

Also provide:
- product_name: short, memorable, lowercase domain-friendly
- tagline: one line, problem-first
- stripe_description: what Stripe will show on the checkout page (max 22 chars)
- cold_outreach: 3-sentence DM to send to someone who posted about this pain
- reddit_communities: 2 most relevant subreddits to post this in

Respond ONLY in valid JSON, no markdown:
{
  "product_name": "...",
  "tagline": "...",
  "stripe_description": "...",
  "html": "<!DOCTYPE html>...",
  "cold_outreach": "...",
  "reddit_communities": ["r/...", "r/..."]
}
`;

  try {
    const response = await callLocalBrain(prompt);
    let parsed: any = null;

    try {
      const clean = response.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      // Brain didn't return clean JSON — store raw and continue
      await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["build_json_parse_fail", { opportunity_id: opportunity.id, raw: response.slice(0, 500) }]);
    }

    // Write product folder
    const folderName = `product_${opportunity.id}`;
    const folderPath = path.join("products", folderName);
    if (!fs.existsSync("products")) fs.mkdirSync("products");
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);

    if (parsed?.html) {
      fs.writeFileSync(path.join(folderPath, "index.html"), parsed.html);
    }
    if (parsed?.cold_outreach) {
      fs.writeFileSync(path.join(folderPath, "cold_outreach.txt"), parsed.cold_outreach);
    }

    fs.writeFileSync(path.join(folderPath, "README.md"), `
# ${parsed?.product_name || opportunity.title}

**Tagline:** ${parsed?.tagline || ""}
**Stripe description:** ${parsed?.stripe_description || ""}
**Reddit targets:** ${(parsed?.reddit_communities || []).join(", ")}

## Preorder Steps (YOU must do these)
1. Create Stripe payment link at https://dashboard.stripe.com/payment-links
   - Product: ${parsed?.stripe_description || parsed?.product_name || "Preorder"}
   - Price: $${PREORDER_PRICE} one-time
2. Replace STRIPE_PAYMENT_LINK in index.html with your link
3. Deploy index.html to Vercel: \`vercel --prod\`
4. Post the outreach content (check reach_log or latest_digest.md)
5. Wait 48 hours
6. 1+ payment = reply here and we build the real product
7. 0 payments = run: UPDATE opportunities SET status='killed' WHERE id=${opportunity.id};

## Files
- index.html — landing page, replace STRIPE_PAYMENT_LINK before deploying
- cold_outreach.txt — DM template for direct outreach
`.trim());

    // Mark as building (awaiting preorder)
    await query(`UPDATE opportunities SET status = 'building' WHERE id = $1`, [opportunity.id]);

    // Log the preorder launch
    await query(`INSERT INTO reach_log (opportunity_id, channel, content, status) VALUES ($1, $2, $3, $4)`,
      [opportunity.id, "preorder", `${parsed?.product_name}\n${parsed?.tagline}\nStripe: STRIPE_PAYMENT_LINK`, "drafted"]
    );

    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["preorder_launched", {
        opportunity_id: opportunity.id,
        product_name: parsed?.product_name,
        folder: folderPath,
        reddit_communities: parsed?.reddit_communities,
      }]
    );

    console.log(`  💳 Preorder ready: ${parsed?.product_name || opportunity.title}`);
    console.log(`  📁 Folder: ${folderPath}`);
    console.log(`  ⏳ 48h window starts when you deploy + post`);

    // Draft outreach immediately
    await draftOutreach({ ...opportunity, plan: opportunity.plan, product_name: parsed?.product_name });

    return parsed;

  } catch (err: any) {
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["build_error", { error: err.message, opportunity_id: opportunity.id }]
    );
    await query(`UPDATE opportunities SET status = 'error' WHERE id = $1`, [opportunity.id]);
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
      // Payment received — promote to full build
      await query(`UPDATE opportunities SET status = 'pursue' WHERE id = $1`, [row.opportunity_id]);
      await query(`UPDATE reach_log SET status = 'converted' WHERE id = $1`, [row.reach_id]);
      await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["preorder_converted", { opportunity_id: row.opportunity_id, hours_live: row.hours_live }]
      );
      console.log(`  ✅ PREORDER CONVERTED: "${row.title.slice(0, 50)}" — building real product`);
    } else {
      // No payment — kill it
      await query(`UPDATE opportunities SET status = 'killed' WHERE id = $1`, [row.opportunity_id]);
      await query(`UPDATE reach_log SET status = 'expired' WHERE id = $1`, [row.reach_id]);
      await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["preorder_killed", { opportunity_id: row.opportunity_id, hours_live: row.hours_live }]
      );
      console.log(`  ❌ PREORDER KILLED: "${row.title.slice(0, 50)}" — 0 payments in ${Math.round(Number(row.hours_live))}h`);
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
- layout.tsx: proper <html>, <head> with title/description meta, body. Clean font (Inter via Google Fonts).
- api/process/route.ts: POST handler, receives { input }, returns { result }. Stub with realistic placeholder logic.
- tailwind.config.ts: darkMode 'class', content paths correct for Next.js app router.
- globals.css: only Tailwind base directives (@tailwind base/components/utilities).
- All code must be copy-paste runnable — no placeholders like "add your logic here".
`;

  try {
    const response = await callLocalBrain(prompt);
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

    await query(`UPDATE opportunities SET status = 'shipped' WHERE id = $1`, [opportunity.id]);
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["product_built", { opportunity_id: opportunity.id, folder: folderPath, product_name: productName }]
    );

    console.log(`  🚀 PRODUCT BUILT: ${folderPath}`);
    console.log(`  📂 Next.js project ready — follow ${folderPath}/DEPLOY.md`);
    return parsed;

  } catch (err: any) {
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["build_error", { error: err.message, opportunity_id: opportunity.id }]
    );
    return null;
  }
}

// ── Zombie cleanup — auto-kills stale building opportunities ─────────────────

async function killZombies() {
  const zombieDaysResult = await query(
    `SELECT value FROM policies WHERE key = 'zombie_kill_days'`
  );
  const days = Number(zombieDaysResult.rows[0]?.value ?? 5);

  const zombies = await query(
    `UPDATE opportunities
     SET status = 'killed'
     WHERE status = 'building'
       AND created_at < NOW() - INTERVAL '${days} days'
     RETURNING id, title`
  );

  for (const z of zombies.rows) {
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["zombie_killed", { opportunity_id: z.id, title: z.title, after_days: days }]
    );
    console.log(`  🪦 ZOMBIE KILLED: "${z.title?.slice(0, 55)}" (>${days} days, no revenue)`);
  }

  if (zombies.rows.length === 0) {
    console.log(`  ✓ No zombies found.`);
  }
}

// ── Main entry point called by cycle.ts ─────────────────────────────────────

export async function attemptBuild() {
  // 0. Kill zombies first — free up the build slot before checking limits
  await killZombies();

  // Check active build limit
  const activeBuilds = await query(
    `SELECT COUNT(*) as count FROM opportunities WHERE status = 'building'`
  );
  const maxBuilds = 1;

  // Always check expired preorder windows first
  await checkPreorderWindows();

  // Check if any paid preorders are now ready to build
  const readyToBuild = await query(
    `SELECT id, title, plan, raw_text FROM opportunities WHERE status = 'pursue' 
     AND id IN (SELECT opportunity_id FROM reach_log WHERE channel = 'preorder' AND status = 'converted')
     LIMIT 1`
  );

  if (readyToBuild.rows.length > 0) {
    await buildProduct(readyToBuild.rows[0]);
    return;
  }

  // Launch new preorder if under build limit
  if (Number(activeBuilds.rows[0].count) >= maxBuilds) {
    console.log(`  ⏸  Max active builds reached (${maxBuilds}). Waiting for preorder results.`);
    return;
  }

  const opportunity = await query(
    `SELECT id, title, plan, raw_text FROM opportunities WHERE status = 'pursue' LIMIT 1`
  );

  if (opportunity.rows.length > 0) {
    await launchPreorder(opportunity.rows[0]);
  }
}