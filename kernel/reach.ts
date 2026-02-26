import { callBrain } from "../cognition/llm";
import { query } from "../state/db";

/**
 * reach.ts — The organism's voice.
 *
 * The organism can sense pain and plan solutions, but it dies
 * if it can't reach humans. This module drafts outreach content
 * for each pursued opportunity.
 *
 * Currently: drafts content for human to post (manual step)
 * Future: auto-post via Reddit API, HN, email
 */

export async function draftOutreach(opportunity: any) {
  if (!opportunity.plan) {
    return null;
  }

  const prompt = `
You are writing outreach for a micro-SaaS product launch.

OPPORTUNITY: ${opportunity.title}
PLAN: ${opportunity.plan}

Write TWO pieces of content:

1. A Hacker News "Show HN" post (title + short description, honest, no hype)
2. A Reddit post for a relevant subreddit (mention which subreddit, then write the post)

Rules:
- Be genuinely helpful, not salesy
- Lead with the problem, not the product
- Mention it's a small indie tool
- Ask for feedback, not money

Respond in this EXACT JSON format:
{
  "hn_title": "Show HN: ...",
  "hn_body": "...",
  "reddit_subreddit": "r/...",
  "reddit_title": "...",
  "reddit_body": "...",
  "target_persona": "who exactly should see this"
}
`;

  try {
    const response = await callBrain(prompt, `outreach for: ${opportunity.title?.slice(0, 50)}`, false, "planning");

    let parsed: any = null;
    try {
      const clean = response.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      // Store raw even if not parseable
    }

    // Log the drafted content
    await query(
      `INSERT INTO reach_log (opportunity_id, channel, content, status)
       VALUES ($1, $2, $3, $4)`,
      [opportunity.id, "hn", parsed?.hn_title + "\n\n" + parsed?.hn_body, "drafted"]
    );

    await query(
      `INSERT INTO reach_log (opportunity_id, channel, content, status)
       VALUES ($1, $2, $3, $4)`,
      [
        opportunity.id,
        "reddit",
        `${parsed?.reddit_subreddit}\n${parsed?.reddit_title}\n\n${parsed?.reddit_body}`,
        "drafted",
      ]
    );

    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["outreach_drafted", { opportunity_id: opportunity.id, target: parsed?.target_persona }]
    );

    return parsed;
  } catch (err: any) {
    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["outreach_error", { error: err.message }]
    );
    return null;
  }
}

/**
 * Get all drafted outreach content awaiting human posting.
 * The organism surfaces this so the human can act as its hands.
 */
export async function getPendingOutreach() {
  const result = await query(
    `SELECT r.id, r.channel, r.content, o.title
     FROM reach_log r
     JOIN opportunities o ON o.id = r.opportunity_id
     WHERE r.status = 'drafted'
     ORDER BY r.created_at DESC
     LIMIT 10`
  );
  return result.rows;
}

export async function markPosted(reachId: number, url: string) {
  await query(
    `UPDATE reach_log SET status = 'posted', url = $1 WHERE id = $2`,
    [url, reachId]
  );
}