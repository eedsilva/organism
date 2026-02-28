/**
 * kernel/thesis.ts
 *
 * Active thesis evaluation — falsifiable, versioned.
 * Checks kill signals and success criteria weekly.
 */

import { query } from "../state/db";

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

export interface ThesisPerformance {
  daysElapsed: number;
  displacementEventsWithSpendProofGte07: number;
  buyerCommunitiesMapped: number;
  trustIdentitiesInWarmup: number;
  freeToolsShipped: number;
  activatedUsersTotal: number;
  businessDomainEmails: number;
  payingCustomers: number;
  postsFromTrustedIdentity: number;
  revenue: number;
}

async function gatherThesisPerformance(thesis: {
  starts_at: Date;
  target_segment: string;
}): Promise<ThesisPerformance> {
  const startsAt = new Date(thesis.starts_at);
  const daysElapsed = daysBetween(startsAt, new Date());

  const [dispEvents, communities, identities, tools, leads, revenue, posts] = await Promise.all([
    query(
      `SELECT COUNT(*) as n FROM displacement_events
       WHERE spend_proof_score >= 0.7 AND detected_at >= $1`,
      [startsAt]
    ),
    query(`SELECT COUNT(*) as n FROM buyer_communities`),
    query(
      `SELECT COUNT(*) as n FROM trust_identities WHERE warmup_complete = FALSE`
    ),
    query(
      `SELECT COUNT(*) as n FROM tool_deployments WHERE status IN ('ready', 'deployed') AND created_at >= $1`,
      [startsAt]
    ),
    query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE email NOT LIKE '%gmail%' AND email NOT LIKE '%yahoo%' AND email NOT LIKE '%hotmail%') as biz
       FROM leads WHERE created_at >= $1`,
      [startsAt]
    ),
    query(
      `SELECT COALESCE(SUM(revenue_usd), 0) as total FROM metrics_daily WHERE date >= $1`,
      [startsAt.toISOString().slice(0, 10)]
    ),
    query(
      `SELECT COUNT(*) as n FROM identity_activity_log WHERE activity_type = 'post' AND created_at >= $1`,
      [startsAt]
    ),
  ]);

  const activatedUsersResult = await query(
    `SELECT COALESCE(SUM(activated_users), 0) as total FROM tool_deployments WHERE created_at >= $1`,
    [startsAt]
  );

  const payingResult = await query(
    `SELECT COALESCE(SUM(payments), 0) as total FROM metrics_daily WHERE date >= $1`,
    [startsAt.toISOString().slice(0, 10)]
  );

  return {
    daysElapsed,
    displacementEventsWithSpendProofGte07: Number(dispEvents.rows[0]?.n ?? 0),
    buyerCommunitiesMapped: Number(communities.rows[0]?.n ?? 0),
    trustIdentitiesInWarmup: Number(identities.rows[0]?.n ?? 0),
    freeToolsShipped: Number(tools.rows[0]?.n ?? 0),
    activatedUsersTotal: Number(activatedUsersResult.rows[0]?.total ?? 0),
    businessDomainEmails: Number(leads.rows[0]?.biz ?? 0),
    payingCustomers: Number(payingResult.rows[0]?.total ?? 0),
    postsFromTrustedIdentity: Number(posts.rows[0]?.n ?? 0),
    revenue: Number(revenue.rows[0]?.total ?? 0),
  };
}

function evaluateKillSignal(
  signal: string,
  perf: ThesisPerformance
): boolean {
  const { daysElapsed } = perf;
  if (signal.includes("activated_users") && signal.includes("< 50") && daysElapsed > 45) {
    return perf.activatedUsersTotal < 50;
  }
  if (signal.includes("business_domain_emails") && signal.includes("=== 0") && daysElapsed > 45) {
    return perf.businessDomainEmails === 0;
  }
  if (signal.includes("displacement_events_with_spend_proof") && daysElapsed > 30) {
    return perf.displacementEventsWithSpendProofGte07 === 0;
  }
  if (signal.includes("zero_posts_from_trusted_identity") && daysElapsed > 35) {
    return perf.postsFromTrustedIdentity === 0;
  }
  if (signal.includes("zero_revenue") && daysElapsed > 75) {
    return perf.revenue === 0;
  }
  return false;
}

function evaluateCriteria(criteria: Record<string, any>, perf: ThesisPerformance): boolean {
  for (const [key, value] of Object.entries(criteria)) {
    const perfKey = key.replace(/by_day_\d+\.?/, "").replace(/_/g, "");
    const perfVal = (perf as any)[key];
    if (perfVal !== undefined && perfVal < value) return false;
    if (key === "osi_not_deeply_negative" && typeof value === "boolean") continue;
    if (key === "osi_positive" && typeof value === "boolean") continue;
  }
  return true;
}

export async function evaluateThesis(): Promise<void> {
  const result = await query(
    `SELECT * FROM theses WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`
  );
  const thesis = result.rows[0];
  if (!thesis) return;

  const perf = await gatherThesisPerformance(thesis);
  const killSignals = Array.isArray(thesis.kill_signals) ? thesis.kill_signals : [];

  for (const signal of killSignals) {
    if (evaluateKillSignal(signal, perf)) {
      await query(
        `UPDATE theses SET status = 'paused', reason_for_revision = $1 WHERE id = $2`,
        [`Kill signal: ${signal}`, thesis.id]
      );
      console.log(`  ⚠️ Thesis kill signal triggered: ${signal}`);
      return;
    }
  }

  await query(
    `UPDATE theses SET performance_snapshot = $1 WHERE id = $2`,
    [JSON.stringify({ perf, evaluated_at: new Date().toISOString() }), thesis.id]
  );
}
