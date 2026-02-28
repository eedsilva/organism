import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(stealthPlugin() as any);

export interface TrendTopic {
    keyword: string;
    score: number;
}

/**
 * Scrapes Google Trends directly via Playwright to find rising B2B-adjacent topics.
 * No API key or skill needed — navigates the public trends.google.com explore page.
 */
export async function getTrendingB2BNiche(): Promise<TrendTopic[]> {
    const broadKeywords = [
        "business software",
        "data entry automation",
        "manual scheduling",
        "workflow management",
        "invoice processing"
    ];
    const keyword = broadKeywords[Math.floor(Math.random() * broadKeywords.length)];

    console.log(`  🔍 [Trends] Scraping Google Trends for: "${keyword}"...`);

    const browser = await chromium.launch({
        headless: true,
        channel: "chrome",
        ignoreDefaultArgs: ["--enable-automation"],
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
    });

    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        locale: "en-US",
    });

    const page = await context.newPage();
    const topics: TrendTopic[] = [];

    try {
        const url = `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&geo=US&hl=en-US`;
        await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(3000);

        // Scrape the "Related queries" RISING section
        const risingQueries = await page.evaluate(() => {
            const results: string[] = [];

            // Look for all "rising" items in the related queries widget
            const items = document.querySelectorAll(".trends-widget-table-row");
            items.forEach(el => {
                const text = (el as HTMLElement).innerText?.trim();
                const isRising = el.querySelector(".trending-queries-icon") !== null
                    || el.textContent?.includes("Breakout")
                    || el.textContent?.includes("+");
                if (text && isRising) results.push(text.split("\n")[0]);
            });

            // Also try the feed items
            if (results.length === 0) {
                document.querySelectorAll(".fe-atoms-gene-related-queries-item").forEach(el => {
                    const text = (el as HTMLElement).innerText?.trim();
                    if (text) results.push(text.split("\n")[0]);
                });
            }

            return results.slice(0, 5);
        });

        console.log(`  📈 [Trends] Raw rising queries:`, risingQueries);

        for (const q of risingQueries) {
            if (q.length > 5) {
                topics.push({ keyword: q, score: 100 });
            }
        }

    } catch (err: any) {
        console.warn(`  ⚠️ [Trends] Failed: ${err.message}`);
    } finally {
        await page.close();
        await context.close();
        await browser.close();
    }

    return topics;
}
