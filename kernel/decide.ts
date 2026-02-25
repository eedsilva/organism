import { query } from "../state/db";

export async function selectTopOpportunity() {
  const result = await query(
    `
    SELECT id, title, pain_score
    FROM opportunities
    WHERE status = 'new' AND pain_score >= 20
    ORDER BY pain_score DESC
    LIMIT 1
    `
  );

  if (result.rows.length === 0) {
    return null;
  }

  const opportunity = result.rows[0];

  await query(
    `
    UPDATE opportunities
    SET status = 'reviewing'
    WHERE id = $1
    `,
    [opportunity.id]
  );

  return opportunity;
}