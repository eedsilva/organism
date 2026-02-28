#!/usr/bin/env ts-node
/**
 * trust-warmup.ts
 *
 * Warm up a Trust Identity on Reddit.
 * Launches a headed browser with a dedicated persistent profile per handle.
 * You log in, and it will scroll, click a few upvotes, and record the activity
 * to the `identity_activity_log` to safely age the account before it posts links.
 *
 * Usage:
 *   npx ts-node scripts/trust-warmup.ts <reddit_handle>
 */

import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { query } from "../state/db";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

chromium.use(stealthPlugin() as any);

const handle = process.argv[2];

if (!handle) {
    console.log("❌ Please provide a Reddit handle to warm up (e.g. npx ts-node scripts/trust-warmup.ts ShopifyDev99)");
    process.exit(1);
}

const PROFILE_DIR = path.join(os.homedir(), `.organism-trust-${handle.toLowerCase()}`);
const AUTH_FILE = `.auth/reddit_${handle.toLowerCase()}.json`;

(async () => {
    console.log(`\n🛡️  Trust Identity Warmup: ${handle}`);
    console.log(`   Profile dir: ${PROFILE_DIR}`);
    console.log(`   If you are not logged in, please log in when the browser opens.`);

    // Ensure trust identity exists in DB
    const res = await query(`SELECT id FROM trust_identities WHERE handle = $1`, [handle]);
    let identityId = res.rows[0]?.id;

    if (!identityId) {
        const insert = await query(
            `INSERT INTO trust_identities (platform, handle, auth_file, trust_level) VALUES ('reddit', $1, $2, 'building') RETURNING id`,
            [handle, AUTH_FILE]
        );
        identityId = insert.rows[0].id;
        console.log(`   Added new trust identity to tracking DB (ID: ${identityId})`);
    }

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        headless: false, // Must be headed to bypass bot checks and allow human login
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        locale: "en-US",
    } as any);

    const page = await context.newPage();

    console.log("\n🌐 Navigating to Reddit...");
    await page.goto("https://www.reddit.com");

    console.log("⏳ Waiting 30s. If you need to log in, do it now...");
    await page.waitForTimeout(30000);

    console.log("📜 Starting natural scrolling behavior...");
    for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 800 + Math.random() * 400);
        await page.waitForTimeout(2000 + Math.random() * 3000);
    }

    // Attempt to upvote something randomly to build karma/history
    try {
        const upvoteButtons = await page.$$('button[data-click-id="upvote"]');
        if (upvoteButtons.length > 0) {
            const target = upvoteButtons[Math.floor(Math.random() * Math.min(5, upvoteButtons.length))];
            await target.click();
            console.log("   👍 Clicked an upvote to simulate engagement.");

            await query(`INSERT INTO identity_activity_log (identity_id, activity_type, content_preview) VALUES ($1, 'upvote', 'Random feed upvote')`, [identityId]);
        }
    } catch (e) {
        console.log("   ⚠️ Could not click upvote, skipping...");
    }

    console.log("\n💾 Saving session auth state...");
    if (!fs.existsSync(".auth")) fs.mkdirSync(".auth");
    await context.storageState({ path: AUTH_FILE });

    await query(
        `UPDATE trust_identities SET account_age_days = COALESCE(account_age_days, 0) + 1, last_active_at = NOW() WHERE id = $1`,
        [identityId]
    );

    await page.close();
    await context.close();

    console.log(`\n✅ Warmup cycle complete for ${handle}. Session saved to ${AUTH_FILE}.`);
})();
