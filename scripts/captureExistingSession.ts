import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function main() {
    const target = process.argv[2]; // 'chatgpt' or 'gemini'
    if (!target || !['chatgpt', 'gemini'].includes(target)) {
        console.error("❌ Please specify 'chatgpt' or 'gemini'. Example: npx ts-node scripts/captureExistingSession.ts chatgpt");
        process.exit(1);
    }

    const authFile = path.join(__dirname, `../.auth/${target}.json`);

    console.log(`🔌 Attempting to connect to your running Chrome browser...`);
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();

        if (contexts.length === 0) {
            console.error("❌ No browser context found.");
            process.exit(1);
        }

        const context = contexts[0];

        // Save the cookies and local storage state directly from your real browser!
        await context.storageState({ path: authFile });

        console.log(`✅ Success! Extracted your active session directly from Chrome.`);
        console.log(`💾 Saved to ${authFile}`);

        await browser.close();

    } catch (err: any) {
        console.log(`\n❌ Failed to connect to your Chrome browser!`);
        console.log(`\nYou must launch Chrome in debugging mode FIRST. Keep this terminal open, and open a NEW terminal window, then run:`);
        console.log(`\n    /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222`);
        console.log(`\nOnce Chrome opens, log in to ${target}, then come back here and run this script again.`);
    }
}

main().catch(console.error);
