/**
 * sense/displacement/priceShock.ts
 *
 * Price shock detector for V4 Revenue Interception Engine.
 * Layer 1: DOM hash diff on pricing pages
 * Layer 2: Semantic diff — extract prices, detect "contact sales" migration
 * Layer 3: Complaint chatter confirmation (stub — Twitter/Reddit search)
 *
 * Runs weekly, not every cycle. Wire to runCycle() with last-run guard.
 */

import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import crypto from "crypto";
import { query } from "../../state/db";

chromium.use(stealthPlugin() as any);

const BROWSER_TIMEOUT_MS = 15000;
const PRICE_SECTION_SELECTORS = [
  "[data-pricing]",
  "[class*='pricing']",
  "[id*='pricing']",
  ".pricing-table",
  "main",
  "body",
];

/**
 * Extract pricing section text from page for diffing.
 */
async function getPricingSectionText(page: any): Promise<string> {
  for (const sel of PRICE_SECTION_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (el) {
        const text = await el.evaluate((e: HTMLElement) => e.innerText || "");
        if (text.length > 100) return text;
      }
    } catch {
      continue;
    }
  }
  return (await page.evaluate(() => document.body?.innerText || "")).slice(0, 15000);
}

/**
 * Compute hash of pricing content for change detection.
 */
function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Extract dollar amounts and detect "contact sales" migration from text.
 */
function semanticDiff(text: string): {
  prices: number[];
  hasContactSales: boolean;
  deltaPercent: number | null;
} {
  const prices: number[] = [];
  const matches = text.match(/\$[\d,]+(?:\.\d{2})?(?:\s*\/\s*(?:mo|month|yr|year|user|seat))?/gi) || [];
  for (const m of matches) {
    const num = parseFloat(m.replace(/[$,]/g, ""));
    if (!isNaN(num) && num > 0) prices.push(num);
  }
  const hasContactSales =
    /\bcontact\s+sales\b/i.test(text) ||
    /\bcontact\s+us\s+for\s+pricing/i.test(text) ||
    /\bpricing\s+available\s+upon\s+request/i.test(text);
  let deltaPercent: number | null = null;
  if (prices.length >= 2) {
    const [min, max] = [Math.min(...prices), Math.max(...prices)];
    if (min > 0) deltaPercent = ((max - min) / min) * 100;
  }
  return { prices, hasContactSales, deltaPercent };
}

/**
 * Run price shock check on all active monitors. Call weekly, not every cycle.
 */
export async function runPriceShockCheck(): Promise<number> {
  const lastRun = await query(
    `SELECT created_at FROM events WHERE type = 'price_shock_scan_complete' ORDER BY created_at DESC LIMIT 1`
  );
  const lastAt = lastRun.rows[0]?.created_at;
  if (lastAt && Date.now() - new Date(lastAt).getTime() < 7 * 24 * 60 * 60 * 1000) {
    return 0; // Skip if run within last 7 days
  }

  const monitors = await query(
    `SELECT id, tool_name, pricing_url, niche, last_hash, last_content, last_prices
     FROM pricing_monitors WHERE monitoring_active = TRUE ORDER BY id`
  );
  if (monitors.rows.length === 0) return 0;

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let changesDetected = 0;
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });

    for (const row of monitors.rows) {
      try {
        const page = await context.newPage();
        await page.goto(row.pricing_url, {
          waitUntil: "domcontentloaded",
          timeout: BROWSER_TIMEOUT_MS,
        });
        await page.waitForTimeout(2000);

        const content = await getPricingSectionText(page);
        await page.close();

        const newHash = hashContent(content);
        const { prices, hasContactSales, deltaPercent } = semanticDiff(content);

        if (row.last_hash && newHash !== row.last_hash) {
          // Change detected
          const displacementStrength =
            hasContactSales ? 0.85 : deltaPercent && deltaPercent > 20 ? 0.9 : 0.6;
          const eventId = `price_shock_${row.tool_name}_${Date.now()}`;

          await query(
            `INSERT INTO displacement_events (
              id, type, product_or_role, affected_persona_niche, affected_persona_title,
              spend_proof_score, displacement_strength, window_urgency, status
            ) VALUES ($1, 'PRICE_SHOCK', $2, $3, $4, 0, $5, 1.0, 'detected')`,
            [
              eventId,
              row.tool_name,
              row.niche,
              `${row.niche} user`,
              displacementStrength,
            ]
          );

          await query(
            `UPDATE pricing_monitors SET
              last_hash = $1, last_content = $2, last_prices = $3,
              change_detected_at = NOW(), change_description = $4, displacement_event_id = $5
             WHERE id = $6`,
            [
              newHash,
              content.slice(0, 5000),
              JSON.stringify(prices),
              hasContactSales ? "Contact sales migration" : `Price delta ~${deltaPercent?.toFixed(0) ?? "?"}%`,
              eventId,
              row.id,
            ]
          );
          changesDetected++;
        } else if (!row.last_hash) {
          // First run — store baseline
          await query(
            `UPDATE pricing_monitors SET last_hash = $1, last_content = $2, last_prices = $3, last_checked_at = NOW() WHERE id = $4`,
            [newHash, content.slice(0, 5000), JSON.stringify(prices), row.id]
          );
        }
      } catch (err: any) {
        console.log(`  ⚠️ [PriceShock] ${row.tool_name}: ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`, [
    "price_shock_scan_complete",
    { monitors_checked: monitors.rows.length, changes_detected: changesDetected },
  ]);
  return changesDetected;
}
