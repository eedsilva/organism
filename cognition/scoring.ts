/**
 * cognition/scoring.ts
 *
 * V4 scoring — algorithmic, no LLM. Extracts spend proof signals from raw text.
 * Used for displacement events to compute SpendProof factor (0–1).
 */

/**
 * Compute SpendProof score from raw text. Algorithmic only — never LLM-assigned.
 * Looks for patterns indicating existing paid usage: dollar amounts, renewal language,
 * seat counts, alternative-seeking behavior, etc.
 */
export function computeSpendProof(text: string): number {
  if (!text || typeof text !== "string") return 0;

  const signals: Array<{ pattern: RegExp; weight: number }> = [
    { pattern: /paying\s+\$[\d,]+/i, weight: 0.35 },
    {
      pattern: /renewal.{0,20}(next|this|upcoming)/i,
      weight: 0.3,
    },
    {
      pattern:
        /been.{0,15}(paying|subscribed|using).{0,15}(for|since)\s+\d/i,
      weight: 0.25,
    },
    { pattern: /\d+\s+(seats?|users?|licenses?)/i, weight: 0.2 },
    {
      pattern: /looking for.{0,25}(alternative|replacement)/i,
      weight: 0.3,
    },
    { pattern: /switching.{0,20}(from|away from)/i, weight: 0.3 },
    { pattern: /cancel.{0,20}(if|unless|when|after)/i, weight: 0.2 },
    { pattern: /invoice|billing|charged|subscription/i, weight: 0.15 },
    { pattern: /plan (tier|level|price)/i, weight: 0.15 },
    { pattern: /\$\d{2,}.*per\s+(month|year|user)/i, weight: 0.35 },
  ];

  let score = 0;
  for (const s of signals) {
    if (s.pattern.test(text)) score += s.weight;
  }
  return Math.min(score, 1.0);
}
