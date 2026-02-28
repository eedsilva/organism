#!/usr/bin/env ts-node
/**
 * trends-warmup.ts
 *
 * Run this ONCE with a visible browser to let Google Trends accept the
 * Playwright persistent profile and save cookies.
 *
 * After this script completes, the headless scraper in trends.ts will
 * use the stored cookies and avoid 429 rate-limiting.
 *
 * Usage:
 *   npx ts-node scripts/trends-warmup.ts
 */

import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import * as path from "path";
import * as os from "os";

chromium.use(stealthPlugin() as any);

const PROFILE_DIR =
    process.env.TRENDS_PROFILE_DIR ||
    path.join(os.homedir(), ".organism-trends-profile");

const WARMUP_URLS = [
    "https://trends.google.com/trends/explore?q=usage+cap&geo=US&hl=en-US",
    "https://trends.google.com/trends/explore?q=contract+renewal&geo=US&hl=en-US",
    "https://trends.google.com/trends/explore?q=price+increase&geo=US&hl=en-US",
];

(async () => {
    console.log(`\n🌡️  Google Trends Warmup`);
    console.log(`   Profile dir: ${PROFILE_DIR}`);
    console.log(`   A browser window will open. Wait for each page to fully load.\n`);

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false, // MUST be headed so Google serves real content
        ignoreDefaultArgs: ["--enable-automation"],
        args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
        ],
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        locale: "en-US",
    } as any);

    const page = await context.newPage();
    page.setDefaultTimeout(40000);

    for (const url of WARMUP_URLS) {
        console.log(`  🌐 Visiting: ${url}`);
        await page.goto(url, { waitUntil: "domcontentloaded" });

        // Wait for real content (not a 429 page)
        await page.waitForFunction(
            () => (document.body?.innerText?.length ?? 0) > 2000,
            { timeout: 20000 }
        ).catch(() => console.warn("  ⚠️  Page may not have loaded fully. Continuing..."));

        await page.waitForTimeout(4000);

        const bodyLen = await page.evaluate(() => document.body?.innerText?.length ?? 0);
        const widgetCount = await page.evaluate(() => document.querySelectorAll("widget").length);
        console.log(`     ✓ body: ${bodyLen} chars | widgets: ${widgetCount}`);
    }

    await page.close();
    await context.close();

    console.log(`\n✅ Warmup complete! Cookies saved to: ${PROFILE_DIR}`);
    console.log(`   You can now run the headless trends scraper.\n`);
})();
