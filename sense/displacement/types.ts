/**
 * sense/displacement/types.ts
 *
 * Displacement event types for the V4 Revenue Interception Engine.
 * These events represent moments when B2B software spend is about to move.
 */

export type DisplacementEventType =
  | "PRICE_SHOCK"
  | "ACQUISITION_KILL"
  | "FEATURE_REMOVAL"
  | "MARKET_GAP";

export type DisplacementEventStatus =
  | "detected"
  | "validating"
  | "active"
  | "expired"
  | "suppressed";

export interface AffectedPersona {
  title: string;
  niche: string;
  estimated_affected: number;
}

export interface DisplacementEvidence {
  url: string;
  snippet: string;
  captured_at: string;
}

export interface DisplacementEvent {
  id: string;
  type: DisplacementEventType;

  product_or_role: string;

  affected_persona: AffectedPersona;

  evidence: DisplacementEvidence[];

  spend_proof_score: number;
  displacement_strength: number;
  window_urgency: number;
  churn_intent_confirmed: boolean;

  detected_at: string;
  window_opens_at: string;
  window_closes_at: string;

  status: DisplacementEventStatus;
}
