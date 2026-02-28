import { BrowserAgent } from "../kernel/browserAgent";
import { query } from "../state/db";
import { sendPushNotification } from "../kernel/notify";

/**
 * twitter.ts — Pain sensing from Twitter/X.
 *
 * Uses the official Twitter API v2 for authenticated requests.
 * Requires TWITTER_BEARER_TOKEN in .env.
 */

const TWITTER_QUERIES = [
    '"wish there was an app"',
    '"is there a tool for"',
    '"spending hours manually"',
    '"hate doing this manually"',
    '"still doing this manually"',
    '"why isn\'t there software for"',
    '"wish someone would build"',
    '"tired of spreadsheets for"',
    '"process is completely broken"',
    '"so expensive to automate"'
];

interface Tweet {
    id: string;
    text: string;
    author_id?: string;
    created_at?: string;
    public_metrics?: {
        retweet_count: number;
        reply_count: number;
        like_count: number;
        quote_count: number;
    };
}

function scorePain(tweet: Tweet): number {
    const text = tweet.text.toLowerCase();
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
        ["tired of spreadsheets", 35], ["someone build", 20],
    ];

    for (const [signal, score] of signals) {
        if (text.includes(signal)) pain += score;
    }

    // Engagement adds a small modifier as it implies others agree with the sentiment
    if (tweet.public_metrics) {
        pain += Math.min(tweet.public_metrics.reply_count * 2, 20);
        pain += Math.min(tweet.public_metrics.like_count / 5, 20);
    }

    return Math.min(pain, 100);
}

function scoreWtp(tweet: Tweet): number {
    const text = tweet.text.toLowerCase();
    let wtp = 0;

    if (text.includes("my team")) wtp += 20;
    if (text.includes("our company")) wtp += 20;
    if (text.includes("clients")) wtp += 15;
    if (text.includes("budget")) wtp += 25;
    if (text.includes("already paying")) wtp += 30;
    if (text.includes("would pay")) wtp += 40;
    if (text.includes("subscription")) wtp += 15;
    if (text.includes("my business")) wtp += 15;

    return Math.min(wtp, 100);
}

function scoreCompetition(tweet: Tweet): number {
    const text = tweet.text.toLowerCase();
    const tools = [
        "zapier", "make.com", "notion", "airtable", "monday", "asana",
        "hubspot", "salesforce", "clickup", "trello", "jira", "quickbooks",
        "xero", "freshbooks", "stripe", "shopify", "wordpress", "webflow",
    ];
    return Math.min(tools.filter(t => text.includes(t)).length * 15, 100);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function senseTwitter() {
    const agent = new BrowserAgent("twitter");

    let inserted = 0;
    let errors = 0;
    const highValueFound: string[] = [];

    console.log("  🐦 Starting Agentic Twitter Sensing...");

    for (const queryStr of TWITTER_QUERIES) {
        try {
            const encodedQuery = encodeURIComponent(`${queryStr} lang:en`);
            const url = `https://x.com/search?q=${encodedQuery}&src=typed_query&f=live`;

            const goal = `Scroll through the tweets. Find people complaining about manual work, wishing for a tool, or asking about software. Extract the full text of any relevant tweet you find.`;

            // Run the autonomous agent loop
            const extractedText = await agent.runTask(url, goal, 6);

            if (!extractedText || extractedText.trim().length === 0) {
                continue; // LLM found nothing on this run
            }

            // The LLM returns a blob of extracted text. We'll treat the entire extraction for this query as one signal for now, or split by lines if it extracted multiple.
            const lines = extractedText.split('\n').filter((l: string) => l.length > 10);

            for (const text of lines) {
                // Mock tweet object to reuse our scoring functions
                const mockTweet: Tweet = {
                    id: `agent-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    text: text
                };

                const painScore = scorePain(mockTweet);
                const wtpScore = scoreWtp(mockTweet);
                const compScore = scoreCompetition(mockTweet);
                const viability = Math.max(0, Math.min(100, painScore + wtpScore - compScore));

                // We don't have the exact tweet URL since we didn't force the LLM to click the timestamp, so we link to the search page.
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
                    ["twitter-agent", text.slice(0, 500), evidenceUrl, painScore, wtpScore, compScore, text.slice(0, 3000)]
                );

                const isNew = result.rows[0]?.is_new;
                if (isNew) inserted++;

                if (isNew && viability >= 60) {
                    highValueFound.push(`[v:${viability}] ${text.slice(0, 70)}`);
                }
            }

        } catch (err: any) {
            console.error(`  ❌ Twitter Agent Error for query "${queryStr}":`, err.message);
            errors++;
            continue;
        }
    }

    await agent.close();

    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["twitter_sense_agent", { queries: TWITTER_QUERIES.length, inserted, errors }]
    );

    if (highValueFound.length > 0) {
        const msg = `🔭 *${highValueFound.length} high-value agentic Twitter signal${highValueFound.length > 1 ? "s" : ""} found*\n\n`
            + highValueFound.slice(0, 5).map(s => `• ${s}`).join("\n")
            + `\n\nReview them in Mission Control.`;

        await sendPushNotification(`High-Value Twitter Signals Detected`, msg);
    }

    console.log(`  Twitter (Agent): ${inserted} new, ${errors} errors`);
}
