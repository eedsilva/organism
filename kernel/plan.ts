import { callLocalBrain } from "../cognition/llm";
import { query } from "../state/db";

/**
 * plan.ts — LLM evaluates opportunities and scores them.
 *
 * Key fixes:
 * - JSON parse failures are now logged visibly (were silent 0s)
 * - Threshold lowered to 30 (was 40, was killing valid ideas scoring 35)
 * - Prompt tightened: score field explained more explicitly
 * - Raw response stored even on parse failure for debugging
 */

const PURSUE_THRESHOLD = 30;

function extractScore(text: string): number {
  // Try to find "score": <number> anywhere in the response
  // even if the full JSON is broken
  const match = text.match(/"score"\s*:\s*(\d+)/);
  if (match) return Math.min(100, Math.max(0, parseInt(match[1])));
  return 0;
}

export async function generatePlan(opportunity: any) {
  const prompt = `
You are evaluating a business opportunity for an autonomous micro-SaaS builder.
Be honest. Overoptimism kills the organism. But don't be nihilistic — some ideas genuinely work.

OPPORTUNITY:
Title: ${opportunity.title}
Source: ${opportunity.source}
${opportunity.raw_text ? `Context:\n${opportunity.raw_text.slice(0, 1500)}` : ""}

YOUR TASK: Score this opportunity's revenue potential from 0 to 100.

Scoring guide:
- 0-20:  Vague, crowded, or no clear buyer with budget
- 21-40: Real pain but unclear monetization or tough competition
- 41-60: Clear pain, identifiable buyer, plausible $39-99/mo product
- 61-80: Strong pain, buyer has budget, low competition, easy to build
- 81-100: Exceptional. Rare. Don't give this unless truly remarkable.

RESPOND ONLY with this JSON. No markdown. No explanation before or after:
{
  "pain_summary": "one sentence: the specific recurring pain",
  "who_pays": "job title or role of the person who would pay",
  "willingness_to_pay": "low|medium|high",
  "tiny_product": "one sentence: the smallest thing that solves this",
  "validation_method": "one concrete action to test demand in 48 hours",
  "risks": "the single biggest reason this fails",
  "score": 45
}

The score must be an integer between 0 and 100. Do not omit it.
`;

  try {
    const response = await callLocalBrain(prompt);

    let parsed: any = null;
    let score = 0;
    let parseMethod = "json";

    try {
      const clean = response.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
      score = Math.min(100, Math.max(0, parseInt(parsed.score) || 0));
    } catch {
      // JSON parse failed — log it visibly, try score extraction
      parseMethod = "fallback";
      score = extractScore(response);

      await query(
        `INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["plan_parse_fail", {
          opportunity_id: opportunity.id,
          extracted_score: score,
          raw_preview: response.slice(0, 300),
        }]
      );

      console.log(`  ⚠️  Plan JSON parse failed for "${opportunity.title?.slice(0, 40)}" — extracted score: ${score}`);
    }

    // Store plan + parse method for debugging
    await query(
      `UPDATE opportunities SET plan = $1 WHERE id = $2`,
      [response.slice(0, 4000), opportunity.id]
    );

    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["plan_generated", {
        opportunity_id: opportunity.id,
        score,
        parse_method: parseMethod,
        parsed: parsed ?? null,
      }]
    );

    // Decision
    if (score >= PURSUE_THRESHOLD) {
      await query(`UPDATE opportunities SET status = 'pursue' WHERE id = $1`, [opportunity.id]);
      await query(
        `INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["decision", { opportunity_id: opportunity.id, action: "pursue", score }]
      );
      console.log(`  ✅ PURSUE (score: ${score}) — ${opportunity.title?.slice(0, 50)}`);
    } else {
      await query(`UPDATE opportunities SET status = 'discarded' WHERE id = $1`, [opportunity.id]);
      await query(
        `INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["decision", { opportunity_id: opportunity.id, action: "discard", score }]
      );
      console.log(`  ❌ Discard (score: ${score}) — ${opportunity.title?.slice(0, 50)}`);
    }

    return { score, parsed };

  } catch (err: any) {
    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["brain_error", { error: err.message, opportunity_id: opportunity.id }]
    );

    await query(`UPDATE opportunities SET status = 'error' WHERE id = $1`, [opportunity.id]);

    console.log(`  ❌ Brain error: ${err.message}`);
    return null;
  }
}