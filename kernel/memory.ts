import { query } from "../state/db";

/**
 * Marks a string (URL or extracted text) as visited so the Agentic Browser
 * does not see it or extract it again in future cycles.
 */
export async function markVisited(urlOrText: string, source: string = "browser"): Promise<void> {
    if (!urlOrText) return;
    // Truncate to prevent indexing errors on massively long texts, but keep enough for uniqueness
    const safeString = urlOrText.slice(0, 1000);
    try {
        await query(
            `INSERT INTO visited_links (url, source) VALUES ($1, $2) ON CONFLICT (url) DO NOTHING`,
            [safeString, source]
        );
    } catch (err: any) {
        console.error(`  ⚠️ Failed to save memory: ${err.message}`);
    }
}

/**
 * Returns the 1000 most recently visited URLs and text snippets
 */
export async function getVisitedLinks(limit: number = 1000): Promise<string[]> {
    try {
        const res = await query(`SELECT url FROM visited_links ORDER BY visited_at DESC LIMIT $1`, [limit]);
        return res.rows.map(r => r.url);
    } catch {
        return [];
    }
}
