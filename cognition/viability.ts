/**
 * cognition/viability.ts
 *
 * V4 multiplicative viability scoring for displacement events.
 * Every factor is 0–1. Zero in any factor = zero total. No compensation.
 */

export interface ViabilityFactors {
  spend_proof: number;
  displacement_strength: number;
  reachability: number;
  build_speed: number;
  distribution_fit: number;
  window_urgency: number;
}

/**
 * Compute multiplicative viability score. Any zero factor zeros the total.
 */
export function computeViability(factors: ViabilityFactors): number {
  const {
    spend_proof,
    displacement_strength,
    reachability,
    build_speed,
    distribution_fit,
    window_urgency,
  } = factors;

  const raw =
    spend_proof *
    displacement_strength *
    reachability *
    build_speed *
    distribution_fit *
    window_urgency;

  return Math.round(raw * 1000) / 1000; // 3 decimal places
}

export function scoreInterpretation(score: number): string {
  if (score >= 0.5) return "EMERGENCY — 96hr clock active";
  if (score >= 0.3) return "HIGH — activate buyer atlas targeting";
  if (score >= 0.15) return "MEDIUM — pursue if queue allows";
  if (score >= 0.05) return "LOW — batch scoring only";
  return "DISCARD — insufficient signal";
}
