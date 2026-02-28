import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import * as path from "path";
import * as fs from "fs";
import { callBrain } from "../cognition/llm";
import { getTrendingB2BNiche } from "./trends";

chromium.use(stealthPlugin() as any);

/**
 * research.ts — Deep Research using Agentic UI
 *
 * Directly navigates to ChatGPT or Gemini using saved sessions,
 * injects a deep research prompt, waits for the response, and extracts
 * a JSON array of 5 niche search queries to pass to sensing modules.
 */

function buildResearchPrompt(trendContext: string): string {
    return `You are an expert B2B analyst and venture capitalist.

CURRENT TRENDING TOPICS on Google Trends (use these as inspiration):
${trendContext}

TASK:
1. Based on the trending topics above, identify ONE highly specific B2B niche where professionals are furious about broken manual workflows.
2. Generate EXACTLY 5 short search queries (MAX 8 words each) written as frustrated Reddit/Twitter complaints. Keep them concise and keyword-rich — these will be used directly as search engine queries.

OUTPUT FORMAT:
Respond with ONLY a raw JSON array of exactly 5 short strings. No markdown, no code blocks, no explanation. Example:
["manual invoice reconciliation nightmare", "prior auth approval process broken", "scheduling software still not automated", "why is CRM data entry still manual", "freight tracking spreadsheet madness"]`;
}

async function runWithChatGPT(authFile: string, prompt: string): Promise<string[]> {
    console.log("  🤖 Opening ChatGPT via stored session...");

    const browser = await chromium.launch({
        headless: true,
        channel: "chrome",
        ignoreDefaultArgs: ["--enable-automation"],
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-infobars"]
    });

    const context = await browser.newContext({
        storageState: authFile,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    try {
        await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(3000);

        // Target the contenteditable prompt editor directly
        const inputSelector = "#prompt-textarea";
        await page.waitForSelector(inputSelector, { timeout: 15000 });

        console.log("  ✅ Chat input found, injecting research prompt...");
        await page.focus(inputSelector);
        await page.click(inputSelector, { force: true });
        await page.waitForTimeout(300);

        // Type the prompt character by character — most reliable for contenteditable divs
        await page.keyboard.type(prompt, { delay: 5 });
        await page.waitForTimeout(500);

        // Submit by clicking the send button
        const sendButton = page.locator("[data-testid='send-button']").first();
        await sendButton.click();

        console.log("  ⏳ Prompt sent, waiting for ChatGPT response...");

        // Wait for the response to finish generating
        // The stop button disappears when the generation is complete
        await page.waitForSelector("[data-testid='stop-button']", { timeout: 10000 }).catch(() => { });
        await page.waitForFunction(
            () => !document.querySelector("[data-testid='stop-button']"),
            { timeout: 60000 }
        );

        console.log("  ✅ Response generated. Extracting...");
        await page.waitForTimeout(1000);

        // Extract the last assistant message's text
        const responseText = await page.evaluate(() => {
            const messages = document.querySelectorAll("[data-message-author-role='assistant']");
            const last = messages[messages.length - 1] as HTMLElement;
            return last?.innerText?.trim() || "";
        });

        console.log("  📄 Raw response (first 300 chars):\n", responseText.slice(0, 300));

        // Strip markdown code blocks, then find the outermost JSON string array
        const cleaned = responseText
            .replace(/```json?/gi, "")
            .replace(/```/g, "")
            .trim();

        const jsonMatch = cleaned.match(/(\[\s*"[\s\S]*?"\s*\])/);
        if (jsonMatch) {
            try {
                const sanitized = jsonMatch[1]
                    .replace(/"\\"([^"]*)\\""/g, '"$1"')
                    .replace(/[\u201C\u201D]/g, '"');

                const parsed: string[] = JSON.parse(sanitized);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    // Truncate each query to max 8 words to improve search hit rates
                    const trimmed = parsed.map(q => q.split(/\s+/).slice(0, 8).join(" "));
                    console.log("  ✅ ChatGPT generated queries:", trimmed);
                    return trimmed;
                }
            } catch (parseErr: any) {
                console.warn("  ⚠️ JSON parse failed:", parseErr.message, "\nRaw match:", jsonMatch[1].slice(0, 150));
            }
        }
        console.warn("  ⚠️ Could not parse JSON from ChatGPT response.");
    } catch (err: any) {
        console.error("  ❌ ChatGPT research error:", err.message);
    } finally {
        await page.close();
        await context.close();
        await browser.close();
    }

    return [];
}

async function fallbackWithLocalLLM(prompt: string): Promise<string[]> {
    console.log("  🧠 Falling back to local LLM for query synthesis...");
    try {
        const result = await callBrain(prompt + "\n\nRespond with just the JSON array:", "Deep Research Fallback", false, "chat");
        const jsonMatch = result.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log("  ✅ Local LLM generated queries:", parsed);
                return parsed;
            }
        }
    } catch (err: any) {
        console.error("  ❌ Local LLM fallback error:", err.message);
    }
    return [];
}

export async function runDeepResearch(): Promise<string[]> {
    console.log("🕵️‍♂️  Starting Deep Research...");

    // Step 1: Fetch Google Trends for grounding context
    let trendContext = "(No Google Trends data available this cycle)";
    try {
        const trends = await getTrendingB2BNiche();
        if (trends.length > 0) {
            trendContext = trends.map(t => `- ${t.keyword}`).join("\n");
            console.log(`  📈 Google Trends context:\n${trendContext}`);
        }
    } catch (e: any) {
        console.warn("  ⚠️ Google Trends scrape failed:", e.message);
    }

    const prompt = buildResearchPrompt(trendContext);

    const chatGPTAuth = path.join(__dirname, "../.auth/chatgpt.json");

    if (fs.existsSync(chatGPTAuth)) {
        const queries = await runWithChatGPT(chatGPTAuth, prompt);
        if (queries.length > 0) return queries;
    }

    // Ultimate fallback: use our own local/cloud LLM
    return fallbackWithLocalLLM(prompt);
}
