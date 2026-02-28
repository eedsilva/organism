/**
 * Archetype: RISK_SCANNER — Scans user config/data for risks exposed by displacement.
 */

export const RISK_SCANNER_TEMPLATE = {
  archetype: "RISK_SCANNER",
  input_type: "textarea",
  output_format: "risk_report_with_export",
  email_gate: "after_partial_results",
  data_dependency_level: "none" as const,
};
