import { BrowserAgent } from "../kernel/browserAgent";
import { query } from "../state/db";
import { sendPushNotification } from "../kernel/notify";

/**
 * linkedin.ts — Pain sensing from LinkedIn using Agentic Browser.
 */

const LINKEDIN_QUERIES = [
    "manual data entry spreadsheet",
    "spending hours every week manually",
    "wish there was a tool for",
    "tired of using spreadsheets for",
    "is there software that can automate",
    "looking for a tool to automate",
];

interface MockPost {
    text: string;
}

function scorePain(post: MockPost): number {
    const text = post.text.toLowerCase();
    let pain = 0;

    const signals: [string, number][] = [
        ["manually", 25], ["wish there was", 30], ["no good", 25],
        ["spending hours", 30], ["every week", 20], ["every day", 20],
        ["paying", 25], ["expensive", 20], ["too much", 20],
        ["nightmare", 20], ["frustrating", 15], ["wasting time", 25],
        ["can't find", 20], ["looking for a tool", 30], ["automate", 20],
        ["still doing this manually", 35], ["need to automate", 30],
        ["process is broken", 35], ["hate having to", 25],
        ["can't believe there isn't", 35], ["looking for software", 30],
        ["tired of spreadsheets", 35], ["anyone built something", 20],
    ];

    for (const [signal, score] of signals) {
        if (text.includes(signal)) pain += score;
    }

    return Math.min(pain, 100);
}

function scoreWtp(post: MockPost): number {
    const text = post.text.toLowerCase();
    let wtp = 0;

    if (text.includes("my team")) wtp += 20;
    if (text.includes("our company")) wtp += 20;
    if (text.includes("clients")) wtp += 15;
    if (text.includes("budget")) wtp += 25;
    if (text.includes("already paying")) wtp += 30;
    if (text.includes("would pay")) wtp += 40;
    if (text.includes("b2b")) wtp += 15;
    if (text.includes("startup")) wtp += 10;
    if (text.includes("founder")) wtp += 10;

    return Math.max(0, Math.min(wtp, 100));
}

function scoreCompetition(post: MockPost): number {
    const text = post.text.toLowerCase();
    const tools = [
        "zapier", "make.com", "notion", "airtable", "monday", "asana",
        "hubspot", "salesforce", "clickup", "trello", "jira", "quickbooks",
        "xero", "freshbooks", "stripe", "shopify", "wordpress", "webflow",
    ];
    return Math.min(tools.filter(t => text.includes(t)).length * 15, 100);
}

export async function senseLinkedIn() {
    const agent = new BrowserAgent("linkedin");

    let inserted = 0;
    let errors = 0;
    const highValueFound: string[] = [];

    console.log("  💼 Starting Agentic LinkedIn Sensing...");

    // To avoid bot detection, pick 2 random queries per cycle
    const selectedQueries = [...LINKEDIN_QUERIES].sort(() => 0.5 - Math.random()).slice(0, 2);

    for (const queryStr of selectedQueries) {
        try {
            await new Promise(r => setTimeout(r, 5000)); // Pause to respect rate limits
            const encodedQuery = encodeURIComponent(queryStr);
            const url = `https://www.linkedin.com/search/results/content/?keywords=${encodedQuery}&origin=GLOBAL_SEARCH_HEADER`;

            const goal = `Scroll through the LinkedIn posts. Find business professionals complaining about manual work, needing software tools, or asking for recommendations. Extract the full text of any relevant post you find.`;

            // Run the autonomous agent loop
            const extractedText = await agent.runTask(url, goal, 5);

            if (!extractedText || extractedText.trim().length === 0) {
                continue; // LLM found nothing on this run
            }

            const lines = extractedText.split('\n').filter((l: string) => l.length > 20);

            for (const text of lines) {
                const mockPost: MockPost = { text };

                const painScore = scorePain(mockPost);
                const wtpScore = scoreWtp(mockPost);
                const compScore = scoreCompetition(mockPost);
                const viability = Math.max(0, Math.min(100, painScore + wtpScore - compScore));

                const evidenceUrl = url;

                const result = await query(
                    `INSERT INTO opportunities 
             (source, title, evidence_url, pain_score, wtp_score, competition_score, raw_text, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
           ON CONFLICT (evidence_url) DO UPDATE 
             SET pain_score       = GREATEST(opportunities.pain_score, $4),
                 wtp_score        = GREATEST(opportunities.wtp_score, $5),
                 seen_count       = COALESCE(opportunities.seen_count, 1) + 1
           RETURNING id, (xmax = 0) AS is_new`,
                    ["linkedin-agent", text.slice(0, 200), evidenceUrl, Math.round(painScore), Math.round(wtpScore), Math.round(compScore), text.slice(0, 3000)]
                );

                const isNew = result.rows[0]?.is_new;
                if (isNew) inserted++;

                if (isNew && viability >= 60) {
                    highValueFound.push(`[v:${viability}] ${text.slice(0, 70)}`);
                }
            }

        } catch (err: any) {
            console.error(`  ❌ LinkedIn Agent Error for query "${queryStr}":`, err.message);
            errors++;
            continue;
        }
    }

    await agent.close();

    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["linkedin_sense_agent", { queries: selectedQueries.length, inserted, errors }]
    );

    if (highValueFound.length > 0) {
        const msg = `🔭 *${highValueFound.length} high-value agentic LinkedIn signal${highValueFound.length > 1 ? "s" : ""} found*\n\n`
            + highValueFound.slice(0, 5).map(s => `• ${s}`).join("\n")
            + `\n\nReview them in Mission Control.`;

        await sendPushNotification(`High-Value LinkedIn Signals Detected`, msg);
    }

    console.log(`  LinkedIn (Agent): ${inserted} new, ${errors} errors`);
}
