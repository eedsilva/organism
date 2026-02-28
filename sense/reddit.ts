import { BrowserAgent } from "../kernel/browserAgent";
import { query } from "../state/db";
import { sendPushNotification } from "../kernel/notify";

/**
 * reddit.ts — Pain sensing from Reddit communities using Agentic Browser.
 */

const SUBREDDITS = [
  "Entrepreneur", "smallbusiness", "freelance", "Contractors", "startups", "SaaS",
  "SideProject", "indiehackers", "webdev", "devops", "msp",
  "legaladvice", "personalfinance", "Bookkeeping", "taxpro",
  "accounting", "projectmanagement", "HireAnEmployee",
];

const PAIN_QUERIES = [
  "I wish there was a tool",
  "is there a tool for",
  "how do you handle",
  "manually doing this",
  "spending hours every week",
  "no good solution",
  "we pay too much for",
  "does anyone else struggle with",
  "still doing this manually",
  "need to automate",
  "our current process is broken",
  "hate having to",
  "can't believe there isn't",
  "looking for software that",
  "tired of using spreadsheets",
  "anyone built something",
];

interface MockPost {
  text: string;
  subreddit: string;
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
    ["tired of using spreadsheets", 35], ["anyone built something", 20],
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
  if (text.includes("would pay")) wtp += 30;
  if (text.includes("subscription")) wtp += 15;
  if (text.includes("my business")) wtp += 15;
  if (["smallbusiness", "Contractors", "Entrepreneur", "msp", "accounting"].includes(post.subreddit)) wtp += 15;

  // Reduce for non-buyers
  if (text.includes("just me")) wtp -= 10;
  if (text.includes("personal project")) wtp -= 15;
  if (text.includes("for fun")) wtp -= 20;
  if (text.includes("as a student")) wtp -= 25;

  return Math.max(0, Math.min(wtp, 100));
}

function scoreCompetition(post: MockPost): number {
  const text = post.text.toLowerCase();
  const tools = [
    "zapier", "make.com", "notion", "airtable", "monday", "asana",
    "hubspot", "salesforce", "clickup", "trello", "jira", "quickbooks",
    "xero", "freshbooks", "stripe", "shopify", "wordpress", "webflow",
    "pipedrive", "zendesk",
  ];
  return Math.min(tools.filter(t => text.includes(t)).length * 15, 100);
}

export async function senseReddit(customQueries?: string[]) {
  const agent = new BrowserAgent("reddit");

  let inserted = 0;
  let errors = 0;
  const highValueFound: string[] = [];

  console.log("  ⚠️  Starting Agentic Reddit Sensing...");

  // The Agentic Browser is much heavier than the old API. 
  // To avoid immediately triggering Reddit's "You're doing that too much" IP ban,
  // we will only pick 2 random subreddits and 2 random queries per cycle.
  const selectedSubreddits = [...SUBREDDITS].sort(() => 0.5 - Math.random()).slice(0, 2);
  const activeQueries = customQueries && customQueries.length > 0
    ? customQueries
    : [...PAIN_QUERIES].sort(() => 0.5 - Math.random()).slice(0, 2);

  for (const subreddit of selectedSubreddits) {
    for (const painQuery of activeQueries) {
      try {
        await new Promise(r => setTimeout(r, 5000)); // Pause to respect rate limits
        const url = `https://www.reddit.com/r/${subreddit}/search/?q=${encodeURIComponent(painQuery)}&restrict_sr=1&sort=new`;
        const goal = `Scroll through the search results. Find people complaining or expressing pain points about manual work, needing software tools, or asking for recommendations. Extract the full text of any relevant post or comment you find.`;

        const extractedText = await agent.runTask(url, goal, 4);

        if (!extractedText || extractedText.trim().length === 0) {
          continue; // LLM found nothing on this run
        }

        // The LLM returns a blob of extracted text. Split by newlines.
        const lines = extractedText.split('\n').filter((l: string) => l.length > 20);

        for (const text of lines) {
          const mockPost: MockPost = { text, subreddit };

          const painScore = scorePain(mockPost);
          const wtpScore = scoreWtp(mockPost);
          const compScore = scoreCompetition(mockPost);
          const viability = Math.max(0, Math.min(100, painScore + wtpScore - compScore));

          const evidenceUrl = url; // Linking to the search page since we don't have the exact post URL

          const result = await query(
            `INSERT INTO opportunities
                   (source, title, evidence_url, pain_score, wtp_score, competition_score, raw_text, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
                 ON CONFLICT (evidence_url) DO UPDATE
                   SET pain_score       = GREATEST(opportunities.pain_score, $4),
                       wtp_score        = GREATEST(opportunities.wtp_score, $5),
                       seen_count       = COALESCE(opportunities.seen_count, 1) + 1
                 RETURNING id, (xmax = 0) AS is_new`,
            [`reddit-agent/r/${subreddit}`, text.slice(0, 200), evidenceUrl, painScore, wtpScore, compScore, text.slice(0, 3000)]
          );

          const isNew = result.rows[0]?.is_new;
          if (isNew) inserted++;

          if (isNew && viability >= 60) {
            highValueFound.push(`[v:${viability}] ${text.slice(0, 70)}`);
          }
        }
      } catch (err: any) {
        console.error(`  ❌ Reddit Agent Error:`, err.message);
        errors++;
        continue;
      }
    }
  }

  await agent.close();

  await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["reddit_sense_agent", { subreddits: SUBREDDITS.length, queries: activeQueries.length, inserted, errors }]
  );

  if (highValueFound.length > 0) {
    const msg = `🔭 *${highValueFound.length} high-value agentic Reddit signal${highValueFound.length > 1 ? "s" : ""} found*\n\n`
      + highValueFound.slice(0, 5).map(s => `• ${s}`).join("\n")
      + `\n\nReview them in Mission Control.`;

    await sendPushNotification(`High-Value Reddit Signals Detected`, msg);
  }

  console.log(`  Reddit (Agent): ${inserted} new, ${errors} errors`);
}