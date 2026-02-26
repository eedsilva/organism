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
  const revenue = await query(`SELECT COALESCE(SUM(revenue_usd), 0) as total FROM metrics_daily`);
  const burn = await query(`SELECT COALESCE(SUM(inference_cost_usd), 0) as total FROM cycles WHERE DATE(started_at) = CURRENT_DATE`);

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
