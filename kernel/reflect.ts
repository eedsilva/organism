import { callLocalBrain } from "../cognition/llm";
import { query } from "../state/db";

/**
 * reflect.ts — Adaptive self-improvement engine.
 *
 * Reflection frequency scales with survival state:
 *   dying      → every 12 hours (emergency mode)
 *   struggling → every 24 hours
 *   surviving  → every 3 days
 *   thriving   → every 7 days
 *
 * The organism reflects more when it's failing,
 * less when it's succeeding. Biological precedent:
 * stressed organisms adapt faster.
 */

const REFLECTION_INTERVALS: Record<string, number> = {
  dying:      0.5,   // 12 hours
  struggling: 1,     // 24 hours
  surviving:  3,     // 3 days
  thriving:   7,     // 7 days
  unknown:    1,     // default: daily
};

async function getLastAssessment(): Promise<string> {
  const result = await query(
    `SELECT result->>'revenue_assessment' as assessment
     FROM reflection_log
     ORDER BY created_at DESC LIMIT 1`
  );
  return result.rows[0]?.assessment ?? "unknown";
}

async function shouldReflect(): Promise<boolean> {
  const last = await query(
    `SELECT created_at FROM events
     WHERE type = 'reflection_complete'
     ORDER BY created_at DESC LIMIT 1`
  );

  if (last.rows.length === 0) return true; // Never reflected

  const lastAssessment = await getLastAssessment();
  const intervalDays = REFLECTION_INTERVALS[lastAssessment] ?? 1;
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

  const hoursSince = (Date.now() - new Date(last.rows[0].created_at).getTime()) / (1000 * 60 * 60);
  const intervalHours = intervalDays * 24;

  const due = (Date.now() - new Date(last.rows[0].created_at).getTime()) >= intervalMs;

  if (due) {
    console.log(`\n🔮 Reflection due (last: ${Math.round(hoursSince)}h ago, interval: ${intervalHours}h [${lastAssessment}])`);
  }

  return due;
}

async function gatherContext(): Promise<Record<string, any>> {
  // Use last 24h or last reflection period — whichever is shorter
  const lastReflection = await query(
    `SELECT created_at FROM reflection_log ORDER BY created_at DESC LIMIT 1`
  );
  const since = lastReflection.rows[0]?.created_at
    ? `'${lastReflection.rows[0].created_at}'`
    : `NOW() - INTERVAL '24 hours'`;

  const outcomes = await query(
    `SELECT status, COUNT(*) as count
     FROM opportunities
     WHERE created_at >= ${since}
     GROUP BY status ORDER BY count DESC`
  );

  const sourcePerformance = await query(
    `SELECT source,
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('pursue','building','shipped') THEN 1 ELSE 0 END) as pursued,
            SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped,
            ROUND(AVG(viability_score)) as avg_viability
     FROM opportunities
     WHERE created_at >= ${since}
     GROUP BY source ORDER BY pursued DESC`
  );

  const outreachPerformance = await query(
    `SELECT channel,
            COUNT(*) as drafted,
            SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) as posted,
            SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted
     FROM reach_log
     WHERE created_at >= ${since}
     GROUP BY channel`
  );

  const revenue = await query(
    `SELECT COALESCE(SUM(revenue_usd), 0) as total,
            COALESCE(SUM(payments), 0) as payments
     FROM metrics_daily
     WHERE date >= CURRENT_DATE - INTERVAL '7 days'`
  );

  const allTimeRevenue = await query(
    `SELECT COALESCE(SUM(revenue_usd), 0) as total,
            COALESCE(SUM(payments), 0) as payments
     FROM metrics_daily`
  );

  const killRate = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'killed') as killed,
       COUNT(*) FILTER (WHERE status IN ('pursue','building','shipped')) as pursued,
       COUNT(*) FILTER (WHERE status = 'discarded') as discarded
     FROM opportunities
     WHERE created_at >= ${since}`
  );

  const cycleHealth = await query(
    `SELECT status, COUNT(*) as count
     FROM cycles
     WHERE started_at >= ${since}
     GROUP BY status`
  );

  const brainErrors = await query(
    `SELECT COUNT(*) as count FROM events
     WHERE type = 'brain_error' AND created_at >= ${since}`
  );

  const policies = await query(`SELECT key, value FROM policies ORDER BY key`);
  const policyMap: Record<string, any> = {};
  for (const row of policies.rows) policyMap[row.key] = row.value;

  // History of past assessments — so brain knows trajectory
  const pastAssessments = await query(
    `SELECT result->>'revenue_assessment' as assessment,
            result->>'summary' as summary,
            created_at
     FROM reflection_log
     ORDER BY created_at DESC LIMIT 5`
  );

  return {
    period: `since ${since.replace(/'/g, "")}`,
    outcomes: outcomes.rows,
    sourcePerformance: sourcePerformance.rows,
    outreachPerformance: outreachPerformance.rows,
    revenue: revenue.rows[0],
    allTimeRevenue: allTimeRevenue.rows[0],
    killRate: killRate.rows[0],
    cycleHealth: cycleHealth.rows,
    brainErrors: Number(brainErrors.rows[0].count),
    currentPolicies: policyMap,
    pastAssessments: pastAssessments.rows,
  };
}

async function runReflection(ctx: Record<string, any>): Promise<any> {
  const prompt = `
You are the reflection engine of an autonomous economic organism.
Analyze performance since the last reflection and update policies to improve survival.

PERIOD: ${ctx.period}

PAST ASSESSMENTS (trajectory):
${JSON.stringify(ctx.pastAssessments, null, 2)}

CURRENT POLICIES:
${JSON.stringify(ctx.currentPolicies, null, 2)}

OPPORTUNITY OUTCOMES:
${JSON.stringify(ctx.outcomes, null, 2)}

SOURCE PERFORMANCE:
${JSON.stringify(ctx.sourcePerformance, null, 2)}

OUTREACH PERFORMANCE:
${JSON.stringify(ctx.outreachPerformance, null, 2)}

REVENUE (period): $${ctx.revenue.total} from ${ctx.revenue.payments} payment(s)
REVENUE (all time): $${ctx.allTimeRevenue.total} from ${ctx.allTimeRevenue.payments} payment(s)

PIPELINE HEALTH: ${JSON.stringify(ctx.killRate, null, 2)}
CYCLE HEALTH: ${JSON.stringify(ctx.cycleHealth, null, 2)}
BRAIN ERRORS: ${ctx.brainErrors}

DECISION RULES:
- If all-time revenue = 0 AND multiple cycles run → status is "struggling" or "dying"
- If pursued rate < 1% of new opportunities → lower min_viability_score
- If brain_errors > 3 → something is wrong with LLM prompts, note it
- If a source has 0 pursued in 2+ reflections → cut its weight below 0.5
- If GitHub avg_viability < 20 → github_weight should be < 0.5
- If Reddit avg_viability > HN avg_viability → increase reddit_weight gap
- Budget: dying=1, struggling=2, surviving=4, thriving=6

Respond ONLY in valid JSON, no markdown, no explanation:
{
  "summary": "2-3 sentences on what happened and why",
  "revenue_assessment": "thriving|surviving|struggling|dying",
  "policy_updates": {
    "min_viability_score": <int 10-80>,
    "daily_budget_usd": <number 1-10>,
    "hackernews_weight": <float 0.3-2.0>,
    "reddit_weight": <float 0.3-2.0>,
    "github_weight": <float 0.1-1.5>,
    "zombie_kill_days": <int 2-14>,
    "max_outreach_drafts_per_day": <int 1-5>,
    "preorder_window_hours": <int 24-96>,
    "min_plan_score": <int 20-70>
  },
  "strategic_notes": "one concrete focus for next period",
  "sensing_recommendation": "widen|maintain|narrow",
  "top_concern": "single most urgent problem",
  "next_reflection_hint": "sooner|normal|later"
}
`;

  const response = await callLocalBrain(prompt);

  try {
    const clean = response.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["reflection_parse_fail", { raw: response.slice(0, 1000) }]
    );
    return null;
  }
}

async function applyPolicyUpdates(updates: Record<string, any>) {
  for (const [key, value] of Object.entries(updates)) {
    await query(
      `INSERT INTO policies (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = $2::jsonb, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
    console.log(`  📐 ${key} = ${value}`);
  }
}

export async function runReflect() {
  if (!(await shouldReflect())) return;

  const lastAssessment = await getLastAssessment();
  const intervalDays = REFLECTION_INTERVALS[lastAssessment] ?? 1;

  console.log(`\n🔮 REFLECTION STARTING [mode: ${lastAssessment}, interval: ${intervalDays * 24}h]`);

  try {
    const ctx = await gatherContext();
    const result = await runReflection(ctx);

    if (!result) {
      console.log("  ⚠️  Brain returned unparseable response. Skipping policy updates.");
      return;
    }

    // Print concise summary
    console.log(`\n  📊 ${result.revenue_assessment?.toUpperCase()} — ${result.summary}`);
    console.log(`  ⚠️  ${result.top_concern}`);
    console.log(`  🎯 ${result.strategic_notes}`);
    console.log(`  🔭 Sensing: ${result.sensing_recommendation}`);

    // Show what interval the next reflection will use
    const nextInterval = REFLECTION_INTERVALS[result.revenue_assessment] ?? 1;
    console.log(`  ⏱  Next reflection in: ${nextInterval * 24}h`);

    console.log("\n  Updating policies:");
    await applyPolicyUpdates(result.policy_updates);

    // Log to reflection_log
    await query(
      `INSERT INTO reflection_log (period_start, period_end, context, result, revenue_assessment)
       VALUES (NOW() - INTERVAL '${intervalDays} days', NOW(), $1, $2, $3)`,
      [JSON.stringify(ctx), JSON.stringify(result), result.revenue_assessment]
    );

    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["reflection_complete", {
        assessment: result.revenue_assessment,
        top_concern: result.top_concern,
        policies_updated: Object.keys(result.policy_updates ?? {}).length,
        next_reflection_hours: nextInterval * 24,
      }]
    );

    console.log("\n✅ Reflection complete.\n");

  } catch (err: any) {
    console.error("❌ Reflection failed:", err.message);
    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["reflection_error", { error: err.message }]
    );
  }
}