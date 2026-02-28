import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(stealthPlugin());
import fs from "fs";
import path from "path";

/**
 * authTwitter.ts
 * 
 * Run this script ONCE to log into Twitter/X interactively.
 * It will save your session cookies to `.auth/twitter.json`.
 * The headless Browser Agent will then use these cookies to bypass the login screen.
 */

const AUTH_FILE = path.join(__dirname, "../.auth/twitter.json");

async function main() {
    console.log("🚀 Launching interactive browser for Twitter login...");

    // Ensure .auth directory exists
    const authDir = path.dirname(AUTH_FILE);
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    const browser = await chromium.launch({ headless: false }); // MUST be visible so user can type password/2FA
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("🌐 Navigating to X.com login...");
    await page.goto("https://x.com/login");

    console.log("⏳ Please log in using the browser window.");
    console.log("   Waiting until you reach the home feed...");

    // Wait until they successfully land on the home timeline (which means login succeeded)
    await page.waitForURL("https://x.com/home", { timeout: 0 }); // 0 = wait forever

    console.log("✅ Login detected! Saving session cookies...");

    // Save cookies and local storage state
    await context.storageState({ path: AUTH_FILE });

    console.log(`💾 Session saved to ${AUTH_FILE}`);
    console.log("You can now close the browser and run the Organism normally. The Agentic Browser will use this session.");

    await browser.close();
}

main().catch(console.error);
