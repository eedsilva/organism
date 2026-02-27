import { query } from "../state/db";
import { sendPushNotification } from "../kernel/notify";
import fetch from "node-fetch";

/**
 * upwork.ts — Pain sensing from real freelance job boards via RSS.
 *
 * Hits the Upwork RSS feed for "manual data entry" and similar queries
 * to find people explicitly paying to solve tedious problems.
 */

// ── Pain and WTP scoring ──────────────────────────────────────────────────────

function scorePain(title: string, description: string): number {
    const text = (title + " " + description).toLowerCase();
    let pain = 30; // Baseline for hiring out a task

    const signals: [string, number][] = [
        ["every day", 20], ["daily", 15], ["every hour", 30], ["weekly", 10],
        ["boring", 15], ["manual", 20], ["tedious", 20], ["repetitive", 25],
        ["error", 15], ["accurate", 10], ["prevent", 10],
        ["copy data", 20], ["spreadsheet", 10], ["data entry", 15],
        ["api", 10], ["automate", 20], ["sync", 15]
    ];

    for (const [signal, score] of signals) {
        if (text.includes(signal)) pain += score;
    }

    return Math.min(pain, 100);
}

function scoreWtp(budgetMatch: RegExpMatchArray | null): number {
    let wtp = 0;

    // Default WTP assuming they are willing to hire SOMEONE
    let budget = 0;
    if (budgetMatch && budgetMatch[1]) {
        budget = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
    }

    // The budget directly indicates Willingness To Pay.
    // If they are willing to pay $500 for a manual task, they'll pay $39/mo for software.
    if (budget >= 500) wtp += 80;
    else if (budget >= 200) wtp += 60;
    else if (budget >= 50) wtp += 30;
    else wtp += 20;

    return Math.min(wtp, 100);
}

// Minimal regex-based RSS parser to avoid heavy XML dependencies
function parseRSS(xml: string) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
        const itemContent = match[1];

        const titleMatch = itemContent.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || itemContent.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
        const descMatch = itemContent.match(/<description>([\s\S]*?)<\/description>/);

        let description = descMatch ? descMatch[1] : "";
        description = description.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1');
        // Clean some basic HTML from description
        description = description.replace(/<[^>]*>?/gm, '');

        if (titleMatch && linkMatch) {
            items.push({
                title: titleMatch[1].replace(/ - Upwork$/, ''),
                link: linkMatch[1],
                description: description,
                // Extract budget if present in description e.g. "Budget: $500"
                budgetMatch: description.match(/Budget:\s*\$([0-9,]+)/i) || titleMatch[1].match(/\$([0-9,]+)/)
            });
        }
    }
    return items;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function senseUpwork() {
    let inserted = 0;
    let errors = 0;
    const highValueFound: string[] = [];

    // Combine queries to hit specific sub-niches
    const queries = ["manual+data+entry", "spreadsheet+automation", "copy+paste+data", "sync+inventory"];

    for (const q of queries) {
        try {
            const feedUrl = `https://www.upwork.com/ab/feed/jobs/rss?q=${q}&sort=recency`;
            const response = await fetch(feedUrl, {
                headers: { "User-Agent": "Mozilla/5.0" }
            });

            if (!response.ok) {
                console.warn(`[Upwork] Failed to fetch query ${q}. Status: ${response.status}`);
                continue;
            }

            const xml = await response.text();
            const jobs = parseRSS(xml);

            for (const job of jobs) {
                const pain = scorePain(job.title, job.description);
                const wtp = scoreWtp(job.budgetMatch);

                if (pain < 40) continue; // Ignore low-pain requests that aren't recurring

                // Check if we already sensed this job
                const existing = await query(`SELECT id FROM opportunity_current_state WHERE evidence_url = $1`, [job.link]);
                if (existing.rows.length > 0) continue;

                const budgetDisplay = job.budgetMatch ? `$${job.budgetMatch[1]}` : "Hourly/Unknown";
                const title = `Freelance Task: ${job.title}`;
                const rawText = `Budget: ${budgetDisplay}\\n\\n${job.description}`;

                // Push to signal_queue instead of direct insertion to opportunities table
                // This fits the new async event-driven brain
                await query(
                    `INSERT INTO signal_queue (source, raw_payload) VALUES ($1, $2)`,
                    ["upwork", JSON.stringify({
                        title: title,
                        evidence_url: job.link,
                        raw_text: rawText,
                        pain_score: pain,
                        wtp_score: wtp,
                        competition_score: 10
                    })]
                );

                inserted++;
            }
        } catch (err: any) {
            console.error(`[Upwork] Error processing query ${q}:`, err.message);
            errors++;
        }
    }

    if (inserted > 0) {
        console.log(`\n  ✅ Sensed ${inserted} promising freelance automation jobs (Errors: ${errors}) pushed to queue.`);
    }
}
