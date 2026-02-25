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

export async function buildProduct(opportunity: any) {
  const prompt = `
You are building a real micro-SaaS product. A customer has already paid $${PREORDER_PRICE}.
Now build the simplest possible working version.

PRODUCT: ${opportunity.title}
PLAN: ${opportunity.plan || ""}

Generate a complete, working Next.js page (single file) that:
1. Accepts user input for the core use case
2. Calls an API route to process it (stub the logic with a realistic placeholder)
3. Displays the output clearly
4. Has a simple, clean UI using inline Tailwind classes

Also generate:
- api_route: the Next.js API route code (app/api/process/route.ts)
- deployment_steps: ordered list of exact commands to deploy on Vercel

Respond ONLY in valid JSON:
{
  "page_code": "...",
  "api_route_code": "...",
  "deployment_steps": ["...", "..."]
}
`;

  try {
    const response = await callLocalBrain(prompt);
    let parsed: any = null;

    try {
      const clean = response.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch { /* store raw */ }

    const folderPath = path.join("products", `product_${opportunity.id}`);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    if (parsed?.page_code) {
      fs.writeFileSync(path.join(folderPath, "page.tsx"), parsed.page_code);
    }
    if (parsed?.api_route_code) {
      fs.writeFileSync(path.join(folderPath, "api_route.ts"), parsed.api_route_code);
    }
    if (parsed?.deployment_steps) {
      fs.writeFileSync(
        path.join(folderPath, "DEPLOY.md"),
        `# Deploy Steps\n\n` + parsed.deployment_steps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")
      );
    }

    await query(`UPDATE opportunities SET status = 'shipped' WHERE id = $1`, [opportunity.id]);
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["product_built", { opportunity_id: opportunity.id, folder: folderPath }]
    );

    console.log(`  🚀 PRODUCT BUILT: ${folderPath}`);
    return parsed;

  } catch (err: any) {
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["build_error", { error: err.message, opportunity_id: opportunity.id }]
    );
    return null;
  }
}

// ── Main entry point called by cycle.ts ─────────────────────────────────────

export async function attemptBuild() {
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