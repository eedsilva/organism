import { callBrain, TaskType } from "../cognition/llm";
import { query } from "../state/db";
import { transitionOpportunity } from "./opportunity";

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
Instead of building a full paid product right away, we are going to build a "Free Tool", "Calculator", or "Lead Magnet" to capture high-intent emails.
Be honest. Overoptimism kills the organism. But don't be nihilistic — some ideas genuinely work.

OPPORTUNITY:
Title: ${opportunity.title}
Source: ${opportunity.source}
${opportunity.raw_text ? `Context:\n${opportunity.raw_text.slice(0, 1500)}` : ""}

YOUR TASK: Score this opportunity's potential to capture high-intent B2B emails from 0 to 100.

Scoring guide:
- 0-20:  Vague, crowded, or no clear buyer with a specific problem.
- 21-40: Real pain but hard to build a simple free tool for.
- 41-60: Clear pain, identifiable buyer, plausible free tool/calculator can be built in a day.
- 61-80: Strong pain, highly specific niche, perfect for a viral or highly-searched free tool.
- 81-100: Exceptional. Rare. Don't give this unless truly remarkable.

RESPOND ONLY with this JSON. No markdown. No explanation before or after:
{
  "pain_summary": "one sentence: the specific recurring pain",
  "who_pays": "job title or role of the person who has this pain",
  "lead_magnet_idea": "one sentence: the specific free tool/calculator we will build to capture their email",
  "risks": "the single biggest reason this fails to get emails",
  "score": 45
}

The score must be an integer between 0 and 100. Do not omit it.
`;

  try {
    const useCloud = (opportunity.viability_score ?? 0) >= 60;

    // Instead of waiting, queue it for the workers
    const jobInput = {
      prompt,
      opportunity_id: opportunity.id,
      title: opportunity.title,
      use_cloud: useCloud
    };

    const res = await query(
      `INSERT INTO llm_jobs (job_type, input) VALUES ($1, $2) RETURNING id`,
      ["plan", JSON.stringify(jobInput)]
    );

    const jobId = res.rows[0].id;
    console.log(`  🕒 Plan job #${jobId} queued for async processing (opportunity: ${opportunity.id})`);

    // Transition the opportunity to 'planning' state to lock it while LLM thinks
    await transitionOpportunity(opportunity.id, 'queued_for_planning');

    return { queued: true, jobId };

  } catch (err: any) {
    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["brain_error", { error: err.message, opportunity_id: opportunity.id }]
    );

    await transitionOpportunity(opportunity.id, 'error', { error: err.message });

    console.log(`  ❌ Error queuing plan job: ${err.message}`);
    return null;
  }
}