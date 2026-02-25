import { callLocalBrain } from "../cognition/llm";
import { query } from "../state/db";
import { draftOutreach } from "./reach";
import fs from "fs";
import path from "path";

export async function attemptBuild() {
  const result = await query(
    `SELECT id, title, plan, raw_text
     FROM opportunities
     WHERE status = 'pursue'
     ORDER BY pain_score DESC
     LIMIT 1`
  );

  if (result.rows.length === 0) return;

  const opportunity = result.rows[0];

  const folderName = `product_${opportunity.id}`;
  const folderPath = path.join("products", folderName);

  if (!fs.existsSync("products")) fs.mkdirSync("products");
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);

  // Ask the brain to generate a real landing page
  const prompt = `
You are building a minimal landing page to validate a product idea.

PRODUCT IDEA: ${opportunity.title}
PLAN: ${opportunity.plan || "No plan yet"}

Generate a complete single-file HTML landing page with:
1. A clear headline stating the problem solved
2. 3 bullet points of benefits
3. An email capture form (just HTML, no backend needed yet — use Formspree placeholder)
4. A price mention: "Early access: $39/month"
5. Simple, clean CSS inline — no frameworks

Also generate:
- A one-paragraph cold email pitch (for reaching out to potential users)
- 5 search keywords someone with this pain would Google

Respond in EXACT JSON format:
{
  "html": "<!DOCTYPE html>...",
  "cold_email": "...",
  "keywords": ["...", "...", "...", "...", "..."],
  "product_name": "...",
  "tagline": "..."
}
`;

  try {
    const response = await callLocalBrain(prompt);
    let parsed: any = null;

    try {
      const clean = response.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      // Fallback: write raw response
      fs.writeFileSync(path.join(folderPath, "plan.md"), response);
    }

    if (parsed?.html) {
      fs.writeFileSync(path.join(folderPath, "index.html"), parsed.html);
    }

    if (parsed?.cold_email) {
      fs.writeFileSync(path.join(folderPath, "cold_email.txt"), parsed.cold_email);
    }

    if (parsed?.keywords) {
      fs.writeFileSync(
        path.join(folderPath, "seo_keywords.txt"),
        parsed.keywords.join("\n")
      );
    }

    // Write README with everything in one place
    fs.writeFileSync(
      path.join(folderPath, "README.md"),
      `# ${parsed?.product_name || opportunity.title}

**Tagline:** ${parsed?.tagline || ""}

## Files
- \`index.html\` — Landing page, ready to deploy on Vercel or Netlify
- \`cold_email.txt\` — Outreach email template
- \`seo_keywords.txt\` — Search terms for SEO/ads

## Next Steps
1. Deploy index.html to Vercel: \`vercel --prod\`
2. Replace Formspree ID in the form
3. Post outreach (check reach_log table)
4. Get 5 email signups before writing any backend code
`
    );

    await query(
      `UPDATE opportunities SET status = 'building' WHERE id = $1`,
      [opportunity.id]
    );

    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["build_complete", { opportunity_id: opportunity.id, folder: folderPath, product_name: parsed?.product_name }]
    );

    // Immediately draft outreach while we have context
    await draftOutreach(opportunity);

  } catch (err: any) {
    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["build_error", { error: err.message, opportunity_id: opportunity.id }]
    );
  }
}