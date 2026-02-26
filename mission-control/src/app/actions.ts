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
