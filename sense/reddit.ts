import fetch from "node-fetch";
import { query } from "../state/db";

/**
 * reddit.ts — Pain sensing from Reddit communities.
 *
 * Reddit is where real operators complain about real problems
 * they are actively paying (or desperately wanting) to solve.
 * Richer signal than HN. More specific. More emotionally honest.
 */

// Subreddits where buyers live — not just developers
const SUBREDDITS = [
  "Entrepreneur",
  "smallbusiness",
  "freelance",
  "Contractors",
  "startups",
  "SaaS",
];

// Phrases that signal genuine, specific pain
const PAIN_QUERIES = [
  "I wish there was a tool",
  "is there a tool for",
  "how do you handle",
  "manually doing this",
  "spending hours every week",
  "no good solution",
  "we pay too much for",
  "does anyone else struggle with",
];

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  score: number;          // upvotes
  num_comments: number;
  subreddit: string;
  author: string;
  created_utc: number;
}

function buildUrl(subreddit: string, query: string): string {
  return `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&sort=top&t=month&limit=5&restrict_sr=1`;
}

function scorePain(post: RedditPost): number {
  const title = (post.title || "").toLowerCase();
  const body = (post.selftext || "").toLowerCase();
  const text = title + " " + body;

  let pain = 0;

  // Explicit pain language
  if (text.includes("manually")) pain += 25;
  if (text.includes("wish there was")) pain += 30;
  if (text.includes("no good")) pain += 25;
  if (text.includes("spending hours")) pain += 30;
  if (text.includes("every week")) pain += 20;
  if (text.includes("every day")) pain += 20;
  if (text.includes("paying")) pain += 25;
  if (text.includes("expensive")) pain += 20;
  if (text.includes("too much")) pain += 20;
  if (text.includes("nightmare")) pain += 20;
  if (text.includes("frustrating")) pain += 15;
  if (text.includes("wasting time")) pain += 25;
  if (text.includes("can't find")) pain += 20;
  if (text.includes("looking for a tool")) pain += 30;
  if (text.includes("automate")) pain += 20;
  if (text.includes("replace")) pain += 15;
  if (text.includes("alternative")) pain += 15;

  // Engagement = real pain, not casual venting
  pain += Math.min(post.score / 5, 20);        // upvotes signal agreement
  pain += Math.min(post.num_comments * 2, 40); // comments signal active problem

  return Math.min(pain, 100);
}

function scorePersona(post: RedditPost): number {
  const title = (post.title || "").toLowerCase();
  const body = (post.selftext || "").toLowerCase();
  const text = title + " " + body;

  let persona = 0;

  // Buyer signals — someone with budget and authority
  if (text.includes("my team")) persona += 20;
  if (text.includes("our company")) persona += 20;
  if (text.includes("we currently")) persona += 15;
  if (text.includes("our workflow")) persona += 15;
  if (text.includes("our process")) persona += 15;
  if (text.includes("clients")) persona += 15;
  if (text.includes("budget")) persona += 25;
  if (text.includes("software we use")) persona += 20;
  if (text.includes("already paying")) persona += 30;
  if (text.includes("would pay")) persona += 30;
  if (text.includes("subscription")) persona += 15;
  if (text.includes("my business")) persona += 15;

  // Venter signals — reduce score
  if (text.includes("just me")) persona -= 10;
  if (text.includes("personal project")) persona -= 15;
  if (text.includes("side project")) persona -= 10;
  if (text.includes("for fun")) persona -= 20;
  if (text.includes("as a student")) persona -= 25;

  // Subreddit quality signal
  const buyerSubreddits = ["smallbusiness", "Contractors", "Entrepreneur"];
  if (buyerSubreddits.includes(post.subreddit)) persona += 15;

  return Math.max(0, Math.min(persona, 100));
}

function detectCompetition(post: RedditPost): number {
  const text = (post.title + " " + post.selftext).toLowerCase();
  const knownTools = [
    "zapier", "make.com", "integromat", "notion", "airtable", "monday",
    "asana", "hubspot", "salesforce", "clickup", "trello", "jira",
    "quickbooks", "xero", "freshbooks", "stripe", "shopify", "wix",
    "squarespace", "wordpress", "webflow", "pipedrive", "zendesk",
  ];

  let competition = 0;
  for (const tool of knownTools) {
    if (text.includes(tool)) competition += 15;
  }

  return Math.min(competition, 100);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function senseReddit() {
  let inserted = 0;
  let errors = 0;

  for (const subreddit of SUBREDDITS) {
    for (const painQuery of PAIN_QUERIES) {
      try {
        await sleep(1100); // Respect Reddit rate limit: 60 req/min unauthenticated

        const url = buildUrl(subreddit, painQuery);
        const res = await fetch(url, {
          headers: {
            "User-Agent": "organism-sense/0.1 (autonomous market research)",
          }
        });

        if (!res.ok) {
          errors++;
          continue;
        }

        const data: any = await res.json();
        const posts: RedditPost[] = (data?.data?.children || []).map((c: any) => c.data);

        for (const post of posts) {
          if (!post.title || post.title.length < 10) continue;

          const painScore = scorePain(post);
          const personaScore = scorePersona(post);
          const competitionScore = detectCompetition(post);

          // Viability = pain + persona - competition
          const viabilityScore = Math.round(
            (painScore * 0.4) + (personaScore * 0.4) - (competitionScore * 0.2)
          );

          const evidenceUrl = `https://reddit.com${post.url || `/r/${subreddit}`}`;

          // Store raw text (capped at 3000 chars) for LLM planning context
          const rawText = [
            `r/${post.subreddit} | Score: ${post.score} | Comments: ${post.num_comments}`,
            `Title: ${post.title}`,
            post.selftext?.slice(0, 2500) || "",
          ].join("\n").slice(0, 3000);

          await query(
            `INSERT INTO opportunities 
               (source, title, evidence_url, pain_score, wtp_score, raw_text, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'new')
             ON CONFLICT (evidence_url) DO UPDATE
               SET pain_score = GREATEST(opportunities.pain_score, $4),
                   wtp_score  = GREATEST(opportunities.wtp_score, $5)`,
            [
              `reddit/r/${subreddit}`,
              post.title.slice(0, 500),
              evidenceUrl,
              painScore,
              personaScore,
              rawText,
            ]
          );

          inserted++;
        }
      } catch {
        errors++;
        continue;
      }
    }
  }

  await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2)`,
    [
      "reddit_sense",
      {
        subreddits: SUBREDDITS.length,
        queries: PAIN_QUERIES.length,
        inserted,
        errors,
      }
    ]
  );

  console.log(`  Reddit: ${inserted} opportunities ingested, ${errors} errors`);
}