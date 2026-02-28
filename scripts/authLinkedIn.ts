import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(stealthPlugin());
import fs from "fs";
import path from "path";

/**
 * authLinkedIn.ts
 * 
 * Run this script ONCE to log into LinkedIn interactively.
 * It will save your session cookies to `.auth/linkedin.json`.
 */

const AUTH_FILE = path.join(__dirname, "../.auth/linkedin.json");

async function main() {
    console.log("🚀 Launching interactive browser for LinkedIn login...");

    // Ensure .auth directory exists
    const authDir = path.dirname(AUTH_FILE);
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    const browser = await chromium.launch({ headless: false }); // MUST be visible so user can type password/2FA
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("🌐 Navigating to LinkedIn login...");
    await page.goto("https://www.linkedin.com/login");

    console.log("⏳ Please log in using the browser window.");
    console.log("   Waiting until you reach the home feed...");

    try {
        // Wait until they successfully land on the home timeline
        await page.waitForURL("**/feed**", { timeout: 0 }); // 0 = wait forever

        console.log("✅ Login detected! Saving session cookies...");
        await context.storageState({ path: AUTH_FILE });
        console.log(`💾 Session saved to ${AUTH_FILE}`);
        console.log("You can now close the browser and run the Organism normally.");
    } catch (e: any) {
        console.log("⚠️ Browser was closed before reaching the feed URL. Attempting to save session anyway...");
        try {
            await context.storageState({ path: AUTH_FILE });
            console.log(`💾 Partial session saved to ${AUTH_FILE}`);
        } catch (innerErr) {
            console.log("❌ Could not save session.");
        }
    }

    try { await browser.close(); } catch (e) { }
}

main().catch(console.error);
