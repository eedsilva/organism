import fetch from "node-fetch";
import { query } from "../state/db";

// Multiple queries to cast a wider net
const HN_QUERIES = [
  "Ask HN: tool for",
  "Ask HN: is there a",
  "automation painful",
  "manual process expensive",
  "no good solution for",
  "we pay too much for",
  "wish there was",
];

interface HNHit {
  objectID: string;
  title: string;
  url?: string;
  story_text?: string;
  num_comments?: number;
  points?: number;
}

function buildUrl(q: string) {
  return `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=5`;
}

function scorePain(hit: HNHit): number {
  const title = (hit.title || "").toLowerCase();
  const body = (hit.story_text || "").toLowerCase();
  const text = title + " " + body;

  let pain = 0;

  // High signal: explicit problem statements
  if (title.includes("ask hn")) pain += 15;
  if (text.includes("paying")) pain += 20;
  if (text.includes("expensive")) pain += 25;
  if (text.includes("no good")) pain += 25;
  if (text.includes("manual")) pain += 20;
  if (text.includes("painful")) pain += 25;
  if (text.includes("wish")) pain += 20;
  if (text.includes("alternative")) pain += 20;
  if (text.includes("replace")) pain += 20;
  if (text.includes("automate")) pain += 20;
  if (text.includes("waste")) pain += 15;
  if (text.includes("hours")) pain += 15;
  if (text.includes("every week")) pain += 20;
  if (text.includes("every day")) pain += 20;

  // Engagement = real pain
  const comments = hit.num_comments || 0;
  const points = hit.points || 0;
  pain += Math.min(comments * 2, 40);
  pain += Math.min(points / 10, 20);

  return Math.min(pain, 100);
}

export async function senseHackerNews() {
  let inserted = 0;

  for (const q of HN_QUERIES) {
    try {
      const res = await fetch(buildUrl(q));
      if (!res.ok) continue;

      const data: any = await res.json();

      for (const hit of (data.hits || []) as HNHit[]) {
        const title = hit.title || "";
        if (!title) continue;

        const url = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
        const pain = scorePain(hit);

        // Store raw text so plan.ts has real context to work with
        const rawText = [
          hit.title,
          hit.story_text || "",
        ].join("\n").slice(0, 2000);

        await query(
          `INSERT INTO opportunities (source, title, evidence_url, pain_score, raw_text)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (evidence_url) DO UPDATE
             SET pain_score = GREATEST(opportunities.pain_score, $4)`,
          ["hackernews", title, url, pain, rawText]
        );

        inserted++;
      }
    } catch {
      // One query failing shouldn't kill the rest
      continue;
    }
  }

  await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["hn_sense", { queries: HN_QUERIES.length, inserted }]
  );
}