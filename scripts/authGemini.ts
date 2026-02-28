import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import readline from "readline";

chromium.use(stealthPlugin());

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function waitForEnter(promptText: string): Promise<void> {
    return new Promise(resolve => rl.question(promptText, () => resolve()));
}

async function main() {
    const authFile = path.join(__dirname, "../.auth/gemini.json");

    console.log("🚀 Launching interactive browser for Google Gemini login...");

    // Launch non-headless so the user can see and interact
    const browser = await chromium.launch({
        headless: false,
        channel: "chrome",
        ignoreDefaultArgs: ["--enable-automation"],
        args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-infobars"
        ]
    });

    const contextOptions: any = {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    };

    if (fs.existsSync(authFile)) {
        console.log("Loading existing session...");
        contextOptions.storageState = authFile;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    console.log("🌐 Navigating to Gemini login...");
    await page.goto("https://gemini.google.com/", { waitUntil: "domcontentloaded" });

    console.log("\n=======================================================");
    console.log("⏳ PLEASE LOG IN USING THE BROWSER WINDOW.");
    console.log("   Once you are fully logged in and see the chat interface,");
    await waitForEnter("   👉 PRESS ENTER HERE IN THE TERMINAL TO SAVE AND CLOSE... ");
    console.log("=======================================================\n");

    try {
        await context.storageState({ path: authFile });
        console.log(`✅ Session saved to ${authFile}`);
    } catch (err: any) {
        console.log("⚠️ Failed to save session:", err.message);
    }

    await browser.close();
    rl.close();
    console.log("🚪 Browser closed.");
}

main().catch(console.error);
