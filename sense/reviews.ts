import fetch from "node-fetch";
import { query } from "../state/db";
import { sendPushNotification } from "../kernel/notify";

/**
 * reviews.ts — Pain sensing from B2B software app stores.
 *
 * Scrapes 1-star and 2-star reviews from platforms like Shopify App Store,
 * Chrome Web Store, or G2 to find validated pain points in expensive software.
 */

// Simulated list of high-value Shopify apps or Chrome extensions to monitor.
// In a production environment, this would hit an actual search/review API or use a scraping service like Apify.
const TARGET_APPS = [
  { name: "Inventory Sync Pro", platform: "shopify", url: "https://apps.shopify.com/inventory-sync-pro/reviews" },
  { name: "CRM Data Exporter", platform: "chrome", url: "https://chrome.google.com/webstore/detail/crm-data" },
  { name: "Automated Bookkeeper", platform: "g2", url: "https://g2.com/products/automated-bookkeeper/reviews" }
];

const B2B_PAIN_QUERIES = [
  "too expensive",
  "support is terrible",
  "missing basic feature",
  "doesn't sync properly",
  "crashes all the time",
  "forcing me to upgrade",
  "takes hours to load",
  "clunky interface",
  "need an alternative"
];

interface ReviewPost {
  id: string;
  app_name: string;
  platform: string;
  rating: number; // 1 to 5
  title: string;
  body: string;
  url: string;
  author: string;
  created_at: string;
}

// ── Pain scoring ──────────────────────────────────────────────────────────────

function scorePain(review: ReviewPost): number {
  const text = ((review.title || "") + " " + (review.body || "")).toLowerCase();
  let pain = 0;

  // Base pain comes from the low rating
  if (review.rating === 1) pain += 40;
  if (review.rating === 2) pain += 30;

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
  const text = ((review.title || "") + " " + (review.body || "")).toLowerCase();
  let wtp = 0;

  // B2B reviews imply high WTP by default (they are paying for the app)
  wtp += 40;

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
  let inserted = 0;
  let errors = 0;
  const highValueFound: string[] = [];

  // Simulate hitting an external API for recent 1-star reviews
  for (const app of TARGET_APPS) {
    try {
      // Simulate network request delay
      await new Promise(r => setTimeout(r, 800));

      // Mocked review data for demonstration. 
      // Replace with real Apify/ScrapingBee API requests.
      const mockReviews: ReviewPost[] = [
        {
          id: `${app.platform}_${Math.floor(Math.random() * 10000)}`,
          app_name: app.name,
          platform: app.platform,
          rating: 1,
          title: "Too expensive for what it does",
          body: "They recently doubled their pricing. It's too expensive now. I just need a simple tool that syncs data, I don't need all these enterprise features. Looking for a cheaper alternative.",
          url: app.url,
          author: "StoreOwner99",
          created_at: new Date().toISOString()
        }
      ];

      for (const review of mockReviews) {
        if (!review.body || review.body.length < 10) continue;

        const painScore = scorePain(review);
        const wtpScore = scoreWtp(review);
        const compScore = 10; // Known competitor (the app being reviewed)
        const viability = Math.max(0, Math.min(100, painScore + wtpScore - compScore));

        const rawText = [
          `Platform: ${review.platform.toUpperCase()} | App: ${review.app_name} | Rating: ${review.rating}⭐`,
          `Title: ${review.title}`,
          review.body?.slice(0, 2500) ?? "",
        ].join("\n").slice(0, 3000);

        const result = await query(
          `INSERT INTO opportunities
             (source, title, evidence_url, pain_score, wtp_score, competition_score, raw_text, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
           ON CONFLICT (evidence_url) DO UPDATE
             SET pain_score       = GREATEST(opportunities.pain_score, $4),
                 wtp_score        = GREATEST(opportunities.wtp_score, $5),
                 seen_count       = COALESCE(opportunities.seen_count, 1) + 1
           RETURNING id, (xmax = 0) AS is_new`,
          [`review/${review.platform}`, `[${review.app_name}] ${review.title}`.slice(0, 500), `${review.url}#${review.id}`, painScore, wtpScore, compScore, rawText]
        );

        const isNew = result.rows[0]?.is_new;
        if (isNew) inserted++;

        // Track high-value new signals for proactive notification
        if (isNew && viability >= 70) {
          highValueFound.push(`[v:${viability}] ${review.app_name}: ${review.title.slice(0, 50)}`);
        }
      }
    } catch {
      errors++;
      continue;
    }
  }

  await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["review_sense", { apps: TARGET_APPS.length, inserted, errors }]
  );

  // Proactive notification if high-value signals found
  if (highValueFound.length > 0) {
    const msg = `🔭 *${highValueFound.length} high-value B2B Review idea${highValueFound.length > 1 ? "s" : ""} found*\n\n`
      + highValueFound.slice(0, 5).map(s => `• ${s}`).join("\n")
      + `\n\nReview them in Mission Control.`;

    await sendPushNotification(
      `High-Value B2B Signals Detected`,
      msg
    );
  }

  console.log(`  Reviews: ${inserted} new, ${errors} errors`);
}
