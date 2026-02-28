/**
 * Archetype: MIGRATION_COMPARATOR — Compares current tool to 2–3 alternatives.
 */

export const MIGRATION_COMPARATOR_TEMPLATE = {
  archetype: "MIGRATION_COMPARATOR",
  inputs: [
    { label: "Current tool", type: "text" },
    { label: "Key features you use", type: "textarea" },
  ],
  output: "structured_comparison_with_recommended_migration_path",
  email_gate: "after_comparison",
  data_dependency_level: "public_api" as const,
};
