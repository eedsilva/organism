/**
 * cognition/archetypeSelector.ts
 *
 * Selects tool archetype from displacement event type.
 * V4 uses pre-built chassis — LLM fills config, does not design from scratch.
 */

import type { DisplacementEventType } from "../sense/displacement/types";

export type ToolArchetype =
  | "VALIDATOR"
  | "COST_ESTIMATOR"
  | "MIGRATION_COMPARATOR"
  | "RISK_SCANNER"
  | "DIFF_ANALYZER";

export function selectArchetype(
  eventType: DisplacementEventType,
  displacementStrength: number,
  niche?: string
): ToolArchetype {
  switch (eventType) {
    case "PRICE_SHOCK":
      return displacementStrength > 0.7 ? "COST_ESTIMATOR" : "DIFF_ANALYZER";
    case "ACQUISITION_KILL":
      return "MIGRATION_COMPARATOR";
    case "FEATURE_REMOVAL":
      return niche === "developer" ? "RISK_SCANNER" : "VALIDATOR";
    case "MARKET_GAP":
      return "VALIDATOR";
    default:
      return "VALIDATOR";
  }
}
