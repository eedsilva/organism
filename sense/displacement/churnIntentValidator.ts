/**
 * sense/displacement/churnIntentValidator.ts
 *
 * After a displacement event is detected, validates that buyers are actually
 * seeking alternatives. Watches for "alternatives to [product]" threads.
 *
 * If no churn intent in 72h: lower DisplacementStrength by 40%
 * If churn intent confirmed: set churn_intent_confirmed = true, multiply DisplacementStrength by 1.3
 */

import { query } from "../../state/db";

/**
 * Check for churn intent signals. Stub implementation — in production this would:
 * - Search Reddit for "[product] alternative" or "alternatives to [product]"
 * - Monitor Google Trends for "[product] alternative" surge
 * - Search Twitter for "switching from [product]"
 *
 * For now returns false (no confirmation). Wire real search when Reddit/Twitter APIs available.
 */
export async function checkChurnIntent(
  _productOrRole: string,
  _niche: string
): Promise<{ confirmed: boolean; evidence?: string }> {
  // TODO: Implement Reddit search, Google Trends, Twitter search
  return { confirmed: false };
}

/**
 * Run churn intent validation on recent displacement events (detected in last 72h).
 */
export async function runChurnIntentValidation(): Promise<number> {
  const events = await query(
    `SELECT id, product_or_role, affected_persona_niche, displacement_strength, churn_intent_confirmed, detected_at
     FROM displacement_events
     WHERE status = 'detected'
       AND churn_intent_confirmed = FALSE
       AND detected_at > NOW() - INTERVAL '72 hours'`
  );

  let updated = 0;
  for (const row of events.rows) {
    const { confirmed } = await checkChurnIntent(
      row.product_or_role,
      row.affected_persona_niche || ""
    );

    if (confirmed) {
      const newStrength = Math.min(1, Number(row.displacement_strength) * 1.3);
      await query(
        `UPDATE displacement_events
         SET churn_intent_confirmed = TRUE, displacement_strength = $1, status = 'validating'
         WHERE id = $2`,
        [newStrength, row.id]
      );
      updated++;
    } else {
      // After 72h with no confirmation, deprioritize
      const hoursSince = (Date.now() - new Date(row.detected_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince >= 72) {
        const newStrength = Math.max(0.2, Number(row.displacement_strength) * 0.6);
        await query(
          `UPDATE displacement_events SET displacement_strength = $1 WHERE id = $2`,
          [newStrength, row.id]
        );
        updated++;
      }
    }
  }
  return updated;
}
