import { query } from "../state/db";

/**
 * decide.ts — Selects the top opportunity by weighted viability score.
 *
 * Applies source_weight from the policies table so reflect.ts
 * can tune which sources the organism trusts most over time.
 *
 * weighted_viability = viability_score * source_weight
 */

async function getSourceWeights(): Promise<Record<string, number>> {
  const result = await query(
    `SELECT key, value FROM policies
     WHERE key LIKE '%_weight'`
  );

  const weights: Record<string, number> = {
    hackernews: 1.0,
    reddit: 1.3,
    github: 0.7,
  };

  for (const row of result.rows) {
    // key format: "hackernews_weight", "reddit_weight", etc.
    const source = row.key.replace("_weight", "");
    weights[source] = Number(row.value);
  }

  return weights;
}

function matchWeight(source: string, weights: Record<string, number>): number {
  // source stored as "hackernews", "reddit/r/Entrepreneur", "github"
  for (const [key, weight] of Object.entries(weights)) {
    if (source.toLowerCase().includes(key)) return weight;
  }
  return 1.0; // default
}

export async function selectTopOpportunity() {
  const weights = await getSourceWeights();

  const minViability = await query(
    `SELECT value FROM policies WHERE key = 'min_viability_score'`
  );
  const threshold = Number(minViability.rows[0]?.value ?? 30);

  // Pull candidates above threshold
  const candidates = await query(
    `SELECT id, title, source, pain_score, wtp_score,
            viability_score, competition_score
     FROM opportunities
     WHERE status = 'new'
       AND viability_score >= $1
     ORDER BY viability_score DESC
     LIMIT 20`,
    [threshold]
  );

  if (candidates.rows.length === 0) return null;

  // Apply source weights client-side — weighted_viability drives final rank
  const ranked = candidates.rows
    .map((row: any) => ({
      ...row,
      source_weight: matchWeight(row.source, weights),
      weighted_viability: Math.round(row.viability_score * matchWeight(row.source, weights)),
    }))
    .sort((a: any, b: any) => b.weighted_viability - a.weighted_viability);

  const top = ranked[0];

  await query(
    `UPDATE opportunities SET status = 'reviewing' WHERE id = $1`,
    [top.id]
  );

  await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["opportunity_selected", {
      id: top.id,
      title: top.title,
      source: top.source,
      viability_score: top.viability_score,
      source_weight: top.source_weight,
      weighted_viability: top.weighted_viability,
    }]
  );

  return top;
}