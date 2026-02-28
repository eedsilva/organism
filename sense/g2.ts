import { query } from "../state/db";
import { sendPushNotification } from "../kernel/notify";

/**
 * g2.ts — Pain sensing from negative B2B software reviews.
 *
 * Simulates scraping G2/Capterra for 1-star and 2-star reviews of
 * expensive B2B tools. If people are paying $200/mo and hate the product,
 * they are telling you exactly what to build to steal them.
 */

import { BrowserAgent } from "../kernel/browserAgent";

/**
 * g2.ts — Pain sensing from negative B2B software reviews using Agentic Browser.
 */

// We will target some large, commonly frustrating B2B categories/products
const TARGET_PRODUCTS = [
    { name: "Salesforce", url: "https://www.g2.com/products/salesforce-sales-cloud/reviews?filters%5Bstar_rating%5D%5B%5D=1&filters%5Bstar_rating%5D%5B%5D=2" },
    { name: "Jira", url: "https://www.g2.com/products/jira/reviews?filters%5Bstar_rating%5D%5B%5D=1&filters%5Bstar_rating%5D%5B%5D=2" },
    { name: "Deel", url: "https://www.g2.com/products/deel/reviews?filters%5Bstar_rating%5D%5B%5D=1&filters%5Bstar_rating%5D%5B%5D=2" },
    { name: "HubSpot", url: "https://www.g2.com/products/hubspot-sales-hub/reviews?filters%5Bstar_rating%5D%5B%5D=1&filters%5Bstar_rating%5D%5B%5D=2" }
];

interface MockReview {
    text: string;
    product: string;
}

// ── Pain and WTP scoring ──────────────────────────────────────────────────────

function scorePain(review: MockReview): number {
    const text = review.text.toLowerCase();
    let pain = 40; // High baseline because they took time to write a bad review

    const signals: [string, number][] = [
        ["terrible", 15], ["hate", 15], ["complex", 10], ["slow", 15],
        ["clunky", 10], ["manually", 20], ["broken", 15], ["looking for", 25],
        ["alternative", 25], ["pain point", 20]
    ];

    for (const [signal, score] of signals) {
        if (text.includes(signal)) pain += score;
    }

    return Math.min(pain, 100);
}

function scoreWtp(review: MockReview): number {
    let wtp = 30; // Baseline WTP since they are already a paying user of *something*

    const text = review.text.toLowerCase();
    if (text.includes("paying") || text.includes("fee") || text.includes("cost") || text.includes("price") || text.includes("expensive")) {
        wtp += 30;
    }

    return Math.min(wtp, 100);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function senseG2() {
    const agent = new BrowserAgent(); // Public reviews, no session needed

    let inserted = 0;
    let errors = 0;
    const highValueFound: string[] = [];

    console.log("  📊 Starting Agentic G2/Software Review Sensing...");

    // Pick 1 random product per cycle to avoid heavy bot detection
    const selectedProduct = TARGET_PRODUCTS[Math.floor(Math.random() * TARGET_PRODUCTS.length)];

    try {
        await new Promise(r => setTimeout(r, 4000));

        const goal = `Scroll through the reviews. These are filtered to 1 and 2 star reviews. Extract the full text of any review where the user complains about complexity, slow speeds, manual work, or high costs. Extract the title and the full review body text.`;

        const extractedText = await agent.runTask(selectedProduct.url, goal, 3);

        if (extractedText && extractedText.trim().length > 0) {
            const lines = extractedText.split('\n\n').filter((l: string) => l.length > 30);

            for (const text of lines) {
                const review: MockReview = { text, product: selectedProduct.name };

                const pain = scorePain(review);
                const wtp = scoreWtp(review);

                if (pain < 50) continue; // Only process highly agitated users

                const title = `G2 Complaint: ${selectedProduct.name} alternative`;

                // Push to signal queue for async processing
                await query(
                    `INSERT INTO signal_queue (source, raw_payload) VALUES ($1, $2)`,
                    ["g2_reviews_agent", JSON.stringify({
                        title: title,
                        evidence_url: selectedProduct.url,
                        raw_text: text,
                        pain_score: pain,
                        wtp_score: wtp,
                        competition_score: 30 // Higher competition since attacking incumbents
                    })]
                );

                inserted++;

                const viability = Math.min(100, Math.max(0, pain + wtp - 30));
                if (viability > 75) {
                    highValueFound.push(`[v:${viability}] ${title}`);
                }
            }
        }
    } catch (err: any) {
        console.error(`  ❌ G2 Agent Error for ${selectedProduct.name}:`, err.message);
        errors++;
    }

    await agent.close();

    await query(
        `INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["g2_sense_agent", { product: selectedProduct.name, inserted, errors }]
    );

    if (inserted > 0) {
        console.log(`  ✅ Sensed ${inserted} high-intent G2 complaints (Errors: ${errors}) pushed to queue.`);

        if (highValueFound.length > 0) {
            await sendPushNotification(
                "Aggressive G2 Disruptions Identified",
                `The Agentic scraper found ${highValueFound.length} high-paying customers ready to churn from incumbents:\\n\\n${highValueFound.join("\\n")}`
            );
        }
    } else {
        console.log(`  G2 (Agent): 0 new complaints found this cycle.`);
    }
}
