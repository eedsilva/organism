import { query } from "../state/db";
import { sendPushNotification } from "../kernel/notify";

/**
 * g2.ts — Pain sensing from negative B2B software reviews.
 *
 * Simulates scraping G2/Capterra for 1-star and 2-star reviews of
 * expensive B2B tools. If people are paying $200/mo and hate the product,
 * they are telling you exactly what to build to steal them.
 */

// Simulated review data. In production, this uses Apify or ScrapingBee.
const MOCK_G2_REVIEWS = [
    {
        id: "g2_1",
        product: "Salesforce",
        stars: 1,
        title: "Way too complex just to track simple leads",
        description: "We are a 5-person agency paying $150/user/month and we only use 10% of the features. It takes 15 clicks just to update a lead status. I just want a fast, keyboard-first CRM that doesn't require a consultant to set up.",
        url: "https://g2.com/reviews/salesforce/123",
        cost_signal: 150
    },
    {
        id: "g2_2",
        product: "Deel",
        stars: 2,
        title: "Good for payroll, terrible for contractor invoicing",
        description: "Their payroll works, but every month our contractors complain about the invoicing flow. They have to manually generate PDFs and upload them. Why can't they just submit hours and have it auto-generate the invoice? Huge pain point for a $50/contractor fee.",
        url: "https://g2.com/reviews/deel/456",
        cost_signal: 50
    },
    {
        id: "g2_3",
        product: "Jira",
        stars: 1,
        title: "Slow, clunky, and hated by my dev team",
        description: "It takes 5 seconds to load a ticket. The search is completely broken. We are actively looking for a lightweight, markdown-native alternative that just works fast, but everything else lacks basic GitHub integrations.",
        url: "https://g2.com/reviews/jira/789",
        cost_signal: 20
    }
];

// ── Pain and WTP scoring ──────────────────────────────────────────────────────

function scorePain(review: typeof MOCK_G2_REVIEWS[0]): number {
    const text = (review.title + " " + review.description).toLowerCase();
    let pain = 40; // High baseline because they took time to write a bad review

    if (review.stars === 1) pain += 20;
    if (review.stars === 2) pain += 10;

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

function scoreWtp(review: typeof MOCK_G2_REVIEWS[0]): number {
    let wtp = 30; // Baseline WTP since they are already a paying user of *something*

    // If they mention the cost, they have budget
    if (review.cost_signal >= 100) wtp += 60;
    else if (review.cost_signal >= 50) wtp += 40;
    else if (review.cost_signal > 0) wtp += 20;

    const text = review.description.toLowerCase();
    if (text.includes("paying") || text.includes("fee") || text.includes("cost")) {
        wtp += 15;
    }

    return Math.min(wtp, 100);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function senseG2() {
    let inserted = 0;
    let errors = 0;
    const highValueFound: string[] = [];

    // In production: trigger Apify task here and wait for results
    // const reviews = await runApifyG2Scraper();
    const reviews = MOCK_G2_REVIEWS;

    for (const review of reviews) {
        try {
            const pain = scorePain(review);
            const wtp = scoreWtp(review);

            if (pain < 50) continue; // Only process highly agitated users

            // Check if we already sensed this review
            const existing = await query(`SELECT id FROM opportunity_current_state WHERE evidence_url = $1`, [review.url]);
            if (existing.rows.length > 0) continue;

            const title = `G2 Complaint: ${review.product} alternative`;
            const rawText = `Rating: ${review.stars}/5\\nTitle: ${review.title}\\n\\n${review.description}`;

            // Push to signal queue for async processing
            await query(
                `INSERT INTO signal_queue (source, raw_payload) VALUES ($1, $2)`,
                ["g2_reviews", JSON.stringify({
                    title: title,
                    evidence_url: review.url,
                    raw_text: rawText,
                    pain_score: pain,
                    wtp_score: wtp,
                    competition_score: 30 // Higher competition since attacking incumbents
                })]
            );

            inserted++;

            // Calculate a pseudo-viability to see if it's worth alerting
            const viability = Math.min(100, Math.max(0, pain + wtp - 30));

            if (viability > 75) {
                highValueFound.push(`[v:${viability}] ${title}`);
            }

        } catch (err: any) {
            console.error(`[G2 Sensor] Error processing review ${review.id}:`, err.message);
            errors++;
        }
    }

    if (inserted > 0) {
        console.log(`\n  ✅ Sensed ${inserted} high-intent G2 complaints (Errors: ${errors}) pushed to queue.`);

        if (highValueFound.length > 0) {
            await sendPushNotification(
                "Aggressive G2 Disruptions Identified",
                `The Organism found ${highValueFound.length} high-paying customers ready to churn from incumbents:\\n\\n${highValueFound.join("\\n")}`
            );
        }
    }
}
