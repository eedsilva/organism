/**
 * Archetype: DIFF_ANALYZER — Before/after diff with impact assessment.
 */

export const DIFF_ANALYZER_TEMPLATE = {
  archetype: "DIFF_ANALYZER",
  inputs: [
    { label: "Old pricing/structure", type: "textarea" },
    { label: "New pricing/structure", type: "textarea" },
  ],
  output: "structured_diff_with_impact",
  email_gate: "after_analysis",
  data_dependency_level: "none" as const,
};
