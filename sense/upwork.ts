import { query } from "../state/db";
import { sendPushNotification } from "../kernel/notify";

/**
 * upwork.ts — Pain sensing from freelance job boards.
 *
 * Scrapes Upwork/Fiverr for jobs where people are paying freelancers to do
 * repetitive, manual tasks. These are prime candidates for micro-SaaS automation.
 */

// Simulated list of freelance jobs. In production, this hits an Upwork RSS feed or API.
const MOCK_UPWORK_JOBS = [
    {
        id: "upw_101",
        title: "Need someone to copy data from PDFs to Excel daily",
        budget: 500, // Fixed price or estimated total
        description: "We receive around 50 invoices in PDF format every day. I need a freelancer to manually type the line items, totals, and dates into our main Google Sheet. This is extremely boring but Needs to be 100% accurate because of accounting.",
        url: "https://upwork.com/jobs/copy-data",
        posted_at: new Date().toISOString()
    },
    {
        id: "upw_102",
        title: "Update Shopify inventory from supplier CSV every hour",
        budget: 800,
        description: "Our dropship supplier sends us an FTP link with a CSV of current stock levels. I need someone to log in every hour, download the CSV, and match the SKUs to our Shopify store to prevent overselling.",
        url: "https://upwork.com/jobs/shopify-inventory",
        posted_at: new Date().toISOString()
    },
    {
        id: "upw_103",
        title: "Monitor competitor website prices",
        budget: 300,
        description: "Looking for a VA to check 3 specific competitor websites every morning and log their pricing for 20 of our core products into a spreadsheet so we can adjust our own.",
        url: "https://upwork.com/jobs/competitor-prices",
        posted_at: new Date().toISOString()
    }
];

// ── Pain and WTP scoring ──────────────────────────────────────────────────────

function scorePain(job: typeof MOCK_UPWORK_JOBS[0]): number {
    const text = ((job.title || "") + " " + (job.description || "")).toLowerCase();
    let pain = 30; // Baseline for hiring out a task

    const signals: [string, number][] = [
        ["every day", 20], ["daily", 15], ["every hour", 30],
        ["boring", 15], ["manual", 20], ["tedious", 20],
        ["error", 15], ["accurate", 10], ["prevent", 10],
        ["copy data", 20], ["spreadsheet", 10]
    ];

    for (const [signal, score] of signals) {
        if (text.includes(signal)) pain += score;
    }

    return Math.min(pain, 100);
}

function scoreWtp(job: typeof MOCK_UPWORK_JOBS[0]): number {
    let wtp = 0;

    // The budget directly indicates Willingness To Pay.
    // If they are willing to pay $500 for a manual task, they'll pay $39/mo for software.
    if (job.budget >= 500) wtp += 80;
    else if (job.budget >= 200) wtp += 60;
    else if (job.budget >= 50) wtp += 30;
    else wtp += 10;

    return Math.min(wtp, 100);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function senseUpwork() {
    let inserted = 0;
    let errors = 0;
    const highValueFound: string[] = [];

    for (const job of MOCK_UPWORK_JOBS) {
        try {
            const pain = scorePain(job);
            const wtp = scoreWtp(job);

            if (pain < 40) continue; // Ignore low-pain requests that aren't recurring

            // Check if we already sensed this job
            const existing = await query(`SELECT id FROM opportunities WHERE evidence_url = $1`, [job.url]);
            if (existing.rows.length > 0) continue;

            const title = `Freelance Task: ${job.title}`;
            const rawText = `Budget: $${job.budget}\\n\\n${job.description}`;

            const res = await query(
                `INSERT INTO opportunities 
           (source, title, evidence_url, raw_text, pain_score, wtp_score, competition_score, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, viability_score`,
                ["upwork", title, job.url, rawText, pain, wtp, 10, "new"]
            );

            inserted++;
            const viability = res.rows[0].viability_score;

            if (viability > 70) {
                highValueFound.push(`[v:${viability}] ${title}`);
            }

        } catch (err: any) {
            if (!err.message.includes("unique constraint")) {
                console.error(`Error processing job ${job.id}:`, err.message);
                errors++;
            }
        }
    }

    if (inserted > 0) {
        console.log(`\n  ✅ Sensed ${inserted} promising freelance automation jobs (Errors: ${errors})`);

        if (highValueFound.length > 0) {
            await sendPushNotification(
                "High-Value Automation Jobs Found",
                `The Organism detected ${highValueFound.length} freelance tasks ripe for micro-SaaS intervention:\\n\\n${highValueFound.join("\\n")}`
            );
        }
    }
}
