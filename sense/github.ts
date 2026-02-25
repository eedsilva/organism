import fetch from "node-fetch";
import { query } from "../state/db";

const GITHUB_SEARCH_URL =
  "https://api.github.com/search/issues?q=is:issue+is:open+label:bug+language:javascript&per_page=5";

export async function senseGithub() {
  try {
    const res = await fetch(GITHUB_SEARCH_URL, {
      headers: {
        "User-Agent": "organism"
      }
    });

    if (!res.ok) {
      return;
    }

    const data: any = await res.json();

    for (const item of data.items) {
        const title: string = item.title || "";
        const body: string = item.body || "";
      
        const text = (title + " " + body).toLowerCase();
      
        let pain = 0;
      
        // Primitive pain heuristics
        if (text.includes("crash")) pain += 20;
        if (text.includes("broken")) pain += 15;
        if (text.includes("error")) pain += 10;
        if (text.includes("fail")) pain += 10;
        if (text.includes("urgent")) pain += 20;
        if (text.includes("not working")) pain += 15;
      
        // Engagement signal
        const comments = item.comments || 0;
        pain += Math.min(comments * 2, 20);
      
        // Cap
        pain = Math.min(pain, 100);
      
        await query(
            `
            INSERT INTO opportunities (source, title, evidence_url, pain_score)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (evidence_url) DO NOTHING
            `,
            [
              "github",
              item.title,
              item.html_url,
              pain
            ]
          );
      }

  } catch (err) {
    // Fail silently for now
  }
}