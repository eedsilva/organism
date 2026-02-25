import { callLocalBrain } from "../cognition/llm";
import { query } from "../state/db";

export async function generatePlan(opportunity: any) {
  const prompt = `
You are an autonomous survival organism evaluating a business opportunity.
You must be ruthlessly honest. Bad ideas kill you. Good ideas sustain you.

OPPORTUNITY:
Title: ${opportunity.title}
Source: ${opportunity.source}
${opportunity.raw_text ? `Context:\n${opportunity.raw_text}` : ""}

EVALUATE and respond in this EXACT JSON format (no markdown, no preamble):
{
  "pain_summary": "one sentence: what is the real pain here?",
  "who_pays": "specific person/role who would pay for a solution",
  "willingness_to_pay": "low|medium|high",
  "tiny_product": "one sentence: smallest possible thing to build",
  "validation_method": "one concrete action to test demand in 48 hours",
  "risks": "biggest reason this fails",
  "score": <integer 0-100, your honest confidence this can generate revenue>
}
`;

  try {
    const response = await callLocalBrain(prompt);

    // Parse LLM response as JSON
    let parsed: any = null;
    let score = 0;

    try {
      // Strip markdown code blocks if present
      const clean = response.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
      score = Math.min(100, Math.max(0, parseInt(parsed.score) || 0));
    } catch {
      // LLM didn't return valid JSON — fallback to keyword scoring
      const text = response.toLowerCase();
      if (text.includes("enterprise")) score += 20;
      if (text.includes("api")) score += 15;
      if (text.includes("automation")) score += 15;
      if (text.includes("subscription")) score += 20;
      if (text.includes("validate")) score += 10;
    }

    // Store the plan on the opportunity
    await query(
      `UPDATE opportunities SET plan = $1 WHERE id = $2`,
      [response, opportunity.id]
    );

    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["plan_generated", { opportunity_id: opportunity.id, score, parsed }]
    );

    // FIXED: only set final status once, no override
    if (score >= 40) {
      await query(
        `UPDATE opportunities SET status = 'pursue' WHERE id = $1`,
        [opportunity.id]
      );
      await query(
        `INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["decision", { opportunity_id: opportunity.id, action: "pursue", score }]
      );
    } else {
      await query(
        `UPDATE opportunities SET status = 'discarded' WHERE id = $1`,
        [opportunity.id]
      );
      await query(
        `INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["decision", { opportunity_id: opportunity.id, action: "discard", score }]
      );
    }

    return { score, parsed };

  } catch (err: any) {
    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["brain_error", { error: err.message, opportunity_id: opportunity.id }]
    );

    // Don't leave stuck in 'reviewing'
    await query(
      `UPDATE opportunities SET status = 'error' WHERE id = $1`,
      [opportunity.id]
    );

    return null;
  }
}