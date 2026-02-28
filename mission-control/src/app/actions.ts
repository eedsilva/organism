'use server';

import { query } from '@/lib/db';

export async function getPipelineOpportunities() {
  const result = await query(`
    SELECT id, title, source, viability_score, status, pain_score, wtp_score, created_at
    FROM opportunities
    ORDER BY viability_score DESC, created_at DESC
  `);
  return result.rows;
}

export async function getSystemMetrics() {
  const [revenue, burn] = await Promise.all([
    query(`SELECT COALESCE(SUM(revenue_usd), 0) as total FROM metrics_daily`),
    query(`SELECT COALESCE(SUM((payload->>'cost_usd')::numeric), 0) as total
           FROM events WHERE type = 'cloud_llm_call' AND DATE(created_at) = CURRENT_DATE`),
  ]);

  return {
    revenue: parseFloat(revenue.rows[0]?.total || '0'),
    burnToday: parseFloat(burn.rows[0]?.total || '0'),
  };
}

export async function getRecentEvents() {
  const events = await query(`
    SELECT id, type, payload, created_at
    FROM events
    ORDER BY created_at DESC
    LIMIT 10
  `);
  return events.rows;
}

export async function getPolicies() {
  const policies = await query(`
    SELECT id, key, value, updated_at
    FROM policies
    ORDER BY key ASC
  `);
  return policies.rows;
}

export async function updatePolicy(key: string, value: string) {
  await query(
    `UPDATE policies SET value = $1::jsonb, updated_at = NOW() WHERE key = $2`,
    [JSON.stringify(value), key]
  );
  return { success: true };
}

export async function getOSIMetrics() {
  const [revenue, llmCost, toolCosts, operatorHoursPolicy] = await Promise.all([
    query(`SELECT COALESCE(SUM(revenue_usd), 0) as total FROM metrics_daily WHERE date >= CURRENT_DATE - INTERVAL '30 days'`),
    query(`SELECT COALESCE(SUM((payload->>'cost_usd')::numeric), 0) as total FROM events WHERE type = 'cloud_llm_call' AND created_at >= NOW() - INTERVAL '30 days'`),
    query(`SELECT COALESCE(SUM(0), 0) as total`), // Tool subscriptions — placeholder
    query(`SELECT value FROM policies WHERE key = 'operator_hours_30d'`),
  ]);
  const revenueVal = parseFloat(revenue.rows[0]?.total || '0');
  const llmCostVal = parseFloat(llmCost.rows[0]?.total || '0');
  const toolCostsVal = 0;
  const operatorHours = parseFloat(operatorHoursPolicy.rows[0]?.value || '0') || 0;
  const rawOSI = revenueVal - llmCostVal - toolCostsVal;
  const effectiveOSIPerHour = operatorHours > 0 ? rawOSI / operatorHours : rawOSI;
  const status = rawOSI > 0 ? 'profitable' : rawOSI > -50 ? 'surviving' : 'dying';
  return {
    revenue: revenueVal,
    llmCost: llmCostVal,
    toolCosts: toolCostsVal,
    rawOSI,
    operatorHours,
    effectiveOSIPerHour,
    status,
  };
}

export async function getDisplacementEvents() {
  const result = await query(`
    SELECT id, type, product_or_role, displacement_strength, viability_score, status, detected_at
    FROM displacement_events
    ORDER BY detected_at DESC LIMIT 10
  `);
  return result.rows;
}

export async function getNichePerformance() {
  try {
    const result = await query(`SELECT niche, communities_mapped, total_leads, activated_users, avg_effectiveness FROM niche_performance`);
    return result.rows;
  } catch {
    return [];
  }
}

export async function getPlausibleStats(domain: string) {
  const apiKey = process.env.PLAUSIBLE_API_KEY;
  if (!apiKey) {
    return { error: 'PLAUSIBLE_API_KEY not set in .env' };
  }

  try {
    const res = await fetch(`https://plausible.io/api/v1/stats/aggregate?site_id=${domain}&period=30d&metrics=visitors,pageviews,bounce_rate,visit_duration`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 60 } // Cache for 60 seconds
    });

    if (!res.ok) throw new Error('Plausible API error');
    const data = await res.json();

    const sourcesRes = await fetch(`https://plausible.io/api/v1/stats/breakdown?site_id=${domain}&period=30d&property=visit:source`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 60 }
    });

    const sourcesData = await sourcesRes.json();

    return {
      stats: data.results,
      sources: sourcesData.results,
    };
  } catch (e: any) {
    return { error: e.message };
  }
}
