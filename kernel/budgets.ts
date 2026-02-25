import { query } from "../state/db";

const DAILY_LIMIT = 5; // $5/day (change if you want)

export async function getTodaySpend(): Promise<number> {
  const result = await query(
    `
    SELECT COALESCE(SUM(inference_cost_usd), 0) as total
    FROM cycles
    WHERE DATE(started_at) = CURRENT_DATE
    `
  );

  return Number(result.rows[0].total);
}

export async function canSpend(amount: number): Promise<boolean> {
  const today = await getTodaySpend();
  return today + amount <= DAILY_LIMIT;
}

export async function getBudgetStatus() {
  const today = await getTodaySpend();

  if (today >= DAILY_LIMIT) {
    return "exhausted";
  }

  if (today >= DAILY_LIMIT * 0.8) {
    return "lean";
  }

  return "normal";
}