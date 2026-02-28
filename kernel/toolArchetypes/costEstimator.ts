/**
 * Archetype: COST_ESTIMATOR — Calculates cost under new pricing vs alternatives.
 */

export const COST_ESTIMATOR_TEMPLATE = {
  archetype: "COST_ESTIMATOR",
  inputs: [
    { label: "Current monthly usage", type: "number" },
    { label: "Number of users", type: "number" },
    { label: "Current plan", type: "select", options: ["Starter", "Professional", "Team", "Enterprise"] },
  ],
  calculation: "new_cost_vs_old_cost_vs_competitor_cost",
  output: "side_by_side_comparison_with_migration_estimate",
  email_gate: "after_calculation",
  data_dependency_level: "none" as const,
};
