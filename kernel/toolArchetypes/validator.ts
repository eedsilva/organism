/**
 * Archetype: VALIDATOR — Checks user input against rules, returns pass/fail or scored report.
 */

export const VALIDATOR_TEMPLATE = {
  archetype: "VALIDATOR",
  input_type: "textarea",
  output_format: "scored_report",
  email_gate: "after_partial_results",
  data_dependency_level: "none" as const,
};
