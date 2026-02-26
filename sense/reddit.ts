import fetch from "node-fetch";
import { query } from "../state/db";

/**
 * reddit.ts — Pain sensing from Reddit communities.
 *
 * Uses OAuth2 for authenticated requests (60 req/min instead of 10).
 * Set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET in .env.
 * Falls back to unauthenticated (slower) if credentials missing.
 */

// Expanded subreddit list — all places where buyers complain
const SUBREDDITS = [
  // Original
  "Entrepreneur", "smallbusiness", "freelance", "Contractors", "startups", "SaaS",
  // Phase 6 additions
  "SideProject", "indiehackers", "webdev", "devops", "msp",
  "legaladvice", "personalfinance", "Bookkeeping", "taxpro",
  "accounting", "projectmanagement", "HireAnEmployee",
];

// Broader pain signal queries — semantic variety catches more real pain
const PAIN_QUERIES = [
  "I wish there was a tool",
  "is there a tool for",
  "how do you handle",
  "manually doing this",
  "spending hours every week",
  "no good solution",
  "we pay too much for",
  "does anyone else struggle with",
  // Phase 6 additions
  "still doing this manually",
  "need to automate",
  "our current process is broken",
  "hate having to",
  "can't believe there isn't",
  "looking for software that",
  "tired of using spreadsheets",
  "anyone built something",
];

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  score: number;
  num_comments: number;
  subreddit: string;
  author: string;
  created_utc: number;
}

// ── OAuth2 token ──────────────────────────────────────────────────────────────

let _oauthToken: string | null = null;
let _tokenExpiry = 0;

async function getOAuthToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  // Reuse cached token
  if (_oauthToken && Date.now() < _tokenExpiry) return _oauthToken;

  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": process.env.REDDIT_USER_AGENT ?? "organism/1.0",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      console.log(`  ⚠️  Reddit OAuth failed: ${res.status}. Using unauthenticated fallback.`);
      return null;
    }

    const data: any = await res.json();
    _oauthToken = data.access_token;
    _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return _oauthToken;
  } catch (err: any) {
    console.log(`  ⚠️  Reddit OAuth error: ${err.message}`);
    return null;
  }
}

function buildUrl(subreddit: string, searchQuery: string, authenticated: boolean): string {
  const base = authenticated ? "https://oauth.reddit.com" : "https://www.reddit.com";
  return `${base}/r/${subreddit}/search.json?q=${encodeURIComponent(searchQuery)}&sort=top&t=month&limit=10&restrict_sr=1`;
}

// ── Pain scoring ──────────────────────────────────────────────────────────────

function scorePain(post: RedditPost): number {
  const text = ((post.title || "") + " " + (post.selftext || "")).toLowerCase();
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

  pain += Math.min(post.score / 5, 20);
  pain += Math.min(post.num_comments * 2, 40);

  return Math.min(pain, 100);
}

function scoreWtp(post: RedditPost): number {
  const text = ((post.title || "") + " " + (post.selftext || "")).toLowerCase();
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

function scoreCompetition(post: RedditPost): number {
  const text = (post.title + " " + post.selftext).toLowerCase();
  const tools = [
    "zapier", "make.com", "notion", "airtable", "monday", "asana",
    "hubspot", "salesforce", "clickup", "trello", "jira", "quickbooks",
    "xero", "freshbooks", "stripe", "shopify", "wordpress", "webflow",
    "pipedrive", "zendesk",
  ];
  return Math.min(tools.filter(t => text.includes(t)).length * 15, 100);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Main export ───────────────────────────────────────────────────────────────

export async function senseReddit() {
  const token = await getOAuthToken();
  const isAuthenticated = !!token;
  const delay = isAuthenticated ? 600 : 1100; // OAuth: 100 req/min; unauth: 60 req/min

  if (!isAuthenticated) {
    console.log("  ⚠️  Reddit: No OAuth credentials — using slower unauthenticated API.");
    console.log("     Set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET in .env for better results.");
  }

  let inserted = 0;
  let errors = 0;
  const highValueFound: string[] = [];

  for (const subreddit of SUBREDDITS) {
    for (const painQuery of PAIN_QUERIES) {
      try {
        await sleep(delay);

        const url = buildUrl(subreddit, painQuery, isAuthenticated);
        const headers: Record<string, string> = {
          "User-Agent": process.env.REDDIT_USER_AGENT ?? "organism/1.0",
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(url, { headers });
        if (!res.ok) { errors++; continue; }

        const data: any = await res.json();
        const posts: RedditPost[] = (data?.data?.children ?? []).map((c: any) => c.data);

        for (const post of posts) {
          if (!post.title || post.title.length < 10) continue;

          const painScore = scorePain(post);
          const wtpScore = scoreWtp(post);
          const compScore = scoreCompetition(post);
          const viability = Math.max(0, Math.min(100, painScore + wtpScore - compScore));

          const rawText = [
            `r/${post.subreddit} | Score: ${post.score} | Comments: ${post.num_comments}`,
            `Title: ${post.title}`,
            post.selftext?.slice(0, 2500) ?? "",
          ].join("\n").slice(0, 3000);

          const evidenceUrl = `https://reddit.com${post.url ?? `/r/${subreddit}`}`;

          const result = await query(
            `INSERT INTO opportunities
               (source, title, evidence_url, pain_score, wtp_score, competition_score, raw_text, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
             ON CONFLICT (evidence_url) DO UPDATE
               SET pain_score       = GREATEST(opportunities.pain_score, $4),
                   wtp_score        = GREATEST(opportunities.wtp_score, $5),
                   seen_count       = COALESCE(opportunities.seen_count, 1) + 1
             RETURNING id, (xmax = 0) AS is_new`,
            [`reddit/r/${subreddit}`, post.title.slice(0, 500), evidenceUrl, painScore, wtpScore, compScore, rawText]
          );

          const isNew = result.rows[0]?.is_new;
          if (isNew) inserted++;

          // Track high-value new signals for proactive notification
          if (isNew && viability >= 60) {
            highValueFound.push(`[v:${viability}] ${post.title.slice(0, 70)}`);
          }
        }
      } catch {
        errors++;
        continue;
      }
    }
  }

  await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["reddit_sense", { subreddits: SUBREDDITS.length, queries: PAIN_QUERIES.length, inserted, errors, authenticated: isAuthenticated }]
  );

  // Proactive notification if high-value signals found
  if (highValueFound.length > 0) {
    const msg = `🔭 *${highValueFound.length} high-value Reddit idea${highValueFound.length > 1 ? "s" : ""} found*\n\n`
      + highValueFound.slice(0, 5).map(s => `• ${s}`).join("\n")
      + `\n\n/ideas to review`;
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["telegram_notify", { message: msg }]
    ).catch(() => { });
  }

  console.log(`  Reddit: ${inserted} new, ${errors} errors (${isAuthenticated ? "OAuth" : "unauth"})`);
}