import fetch from "node-fetch";
import { query } from "../state/db";
import { sendPushNotification } from "../kernel/notify";

/**
 * reviews.ts — Pain sensing from B2B software app stores.
 *
 * Scrapes 1-star and 2-star reviews from platforms like Shopify App Store,
 * Chrome Web Store, or G2 to find validated pain points in expensive software.
 */

import { BrowserAgent } from "../kernel/browserAgent";

/**
 * reviews.ts — Pain sensing from B2B software app stores using Agentic Browser.
 */

// Target highly used, expensive Shopify apps where churn = high intent
const TARGET_APPS = [
  { name: "Klaviyo", platform: "shopify", url: "https://apps.shopify.com/klaviyo-email-marketing/reviews?rating=1" },
  { name: "ReCharge", platform: "shopify", url: "https://apps.shopify.com/recharge/reviews?rating=1" },
  { name: "Gorgias", platform: "shopify", url: "https://apps.shopify.com/helpdesk/reviews?rating=1" }
];

interface ReviewPost {
  text: string;
  app_name: string;
  platform: string;
}

// ── Pain scoring ──────────────────────────────────────────────────────────────

function scorePain(review: ReviewPost): number {
  const text = review.text.toLowerCase();
  let pain = 30; // Base pain for a 1-star review

  const signals: [string, number][] = [
    ["too expensive", 30], ["paying too much", 30], ["terrible", 20],
    ["missing basic", 20], ["clunky", 15], ["crashes", 25],
    ["hours to load", 20], ["wasting time", 25], ["alternative", 35],
    ["cancel", 20], ["refund", 20], ["useless", 15]
  ];

  for (const [signal, score] of signals) {
    if (text.includes(signal)) pain += score;
  }

  return Math.min(pain, 100);
}

function scoreWtp(review: ReviewPost): number {
  const text = review.text.toLowerCase();
  let wtp = 40; // B2B reviews imply high WTP by default (they are paying for the app)

  if (text.includes("we pay")) wtp += 20;
  if (text.includes("pricing changed")) wtp += 30;
  if (text.includes("budget")) wtp += 20;
  if (text.includes("our store")) wtp += 15;
  if (text.includes("my business")) wtp += 15;
  if (text.includes("customers")) wtp += 10;
  if (text.includes("free version")) wtp -= 20;

  return Math.max(0, Math.min(wtp, 100));
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function senseAppReviews() {
  const agent = new BrowserAgent(); // Public reviews, no session needed
  let inserted = 0;
  let errors = 0;
  const highValueFound: string[] = [];

  console.log("  🛍️  Starting Agentic App Store Review Sensing...");

  // Pick 1 random app per cycle to avoid heavy bot detection
  const app = TARGET_APPS[Math.floor(Math.random() * TARGET_APPS.length)];

  try {
    await new Promise(r => setTimeout(r, 4000));

    const goal = `Scroll through the 1-star reviews for this Shopify App. Extract the full text of any review where the store owner complains about it being too expensive, crashing, wasting their time, or needing an alternative. Extract the review body text.`;

    const extractedText = await agent.runTask(app.url, goal, 3);

    if (extractedText && extractedText.trim().length > 0) {
      const lines = extractedText.split('\n\n').filter((l: string) => l.length > 20);

      for (const text of lines) {
        const review: ReviewPost = { text, app_name: app.name, platform: app.platform };

        const painScore = scorePain(review);
        const wtpScore = scoreWtp(review);
        const compScore = 10;
        const viability = Math.max(0, Math.min(100, painScore + wtpScore - compScore));

        if (painScore < 50) continue; // Only strong complaints

        const result = await query(
          `INSERT INTO opportunities
             (source, title, evidence_url, pain_score, wtp_score, competition_score, raw_text, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
           ON CONFLICT (evidence_url) DO UPDATE
             SET pain_score       = GREATEST(opportunities.pain_score, $4),
                 wtp_score        = GREATEST(opportunities.wtp_score, $5),
                 seen_count       = COALESCE(opportunities.seen_count, 1) + 1
           RETURNING id, (xmax = 0) AS is_new`,
          [`review/${app.platform}-agent`, `[${app.name}] App Review Complaint`.slice(0, 500), `${app.url}#agent-${Date.now()}-${Math.floor(Math.random() * 1000)}`, painScore, wtpScore, compScore, text.slice(0, 3000)]
        );

        const isNew = result.rows[0]?.is_new;
        if (isNew) inserted++;

        if (isNew && viability >= 70) {
          highValueFound.push(`[v:${viability}] ${app.name}: ${text.slice(0, 50)}`);
        }
      }
    }
  } catch (err: any) {
    console.error(`  ❌ App Review Agent Error for ${app.name}:`, err.message);
    errors++;
  }

  await agent.close();

  await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["review_sense_agent", { app: app.name, inserted, errors }]
  );

  if (inserted > 0) {
    if (highValueFound.length > 0) {
      const msg = `🔭 *${highValueFound.length} high-value B2B Review idea${highValueFound.length > 1 ? "s" : ""} found*\n\n`
        + highValueFound.slice(0, 5).map(s => `• ${s}`).join("\n")
        + `\n\nReview them in Mission Control.`;

      await sendPushNotification(
        `High-Value B2B Signals Detected`,
        msg
      );
    }
  }

  console.log(`  Reviews (Agent): ${inserted} new, ${errors} errors`);
}
