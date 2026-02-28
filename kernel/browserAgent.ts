import { chromium } from "playwright-extra";
import type { Browser, BrowserContext, Page } from "playwright";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(stealthPlugin());
import { callBrain } from "../cognition/llm";
import { getVisitedLinks, markVisited } from "./memory";

import fs from "fs";
import path from "path";

/**
 * browserAgent.ts — Autonomous Agentic Browser for the Organism.
 * 
 * Replicates the core vision/action loop of `browser-use`:
 * 1. Takes a screenshot/DOM snapshot of the current page
 * 2. Parses interactive elements into a numbered list
 * 3. Asks local LLM (Ollama) what to do next based on the goal
 * 4. Executes the chosen action (click, type, scroll, extract)
 */

interface BrowserAction {
    action: "click" | "type" | "scroll_down" | "done" | "extract";
    elementId?: number;
    text?: string;
    reasoning: string;
}

let sharedBrowser: Browser | null = null;

export class BrowserAgent {
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private authFile: string | null = null;

    constructor(sessionName?: string) {
        if (sessionName) {
            this.authFile = path.join(__dirname, `../.auth/${sessionName}.json`);
        }
    }

    async init() {
        if (!sharedBrowser) {
            const isHeadless = process.env.SHOW_BROWSER === "true" ? false : true;
            sharedBrowser = await chromium.launch({
                headless: isHeadless,
                channel: "chrome", // Use native Chrome for maximum stealth
                ignoreDefaultArgs: ["--enable-automation"],
                args: [
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-infobars"
                ]
            });
        }

        const contextOptions: any = {
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        };

        if (this.authFile && fs.existsSync(this.authFile)) {
            console.log(`  🔐 [Browser Agent] Loading authenticated session data from ${this.authFile}...`);
            contextOptions.storageState = this.authFile;
        }

        this.context = await sharedBrowser.newContext(contextOptions);
        this.page = await this.context.newPage();
    }

    async close() {
        if (this.page) await this.page.close();
        if (this.context) await this.context.close();
    }

    static async closeSharedBrowser() {
        if (sharedBrowser) {
            await sharedBrowser.close();
            sharedBrowser = null;
        }
    }

    /**
     * Injects JS into the page to extract all visible, interactive, or text-heavy elements,
     * assigns them a temporary numeric ID, and returns a simplified string for the LLM.
     */
    private async getPageSnapshot(visitedList: string[] = []): Promise<{ promptText: string; elementMap: Record<number, string> }> {
        if (!this.page) throw new Error("Browser not initialized");

        return await this.page.evaluate((visited) => {
            // Small JS function executed inside the browser to map the DOM
            const interactiveFilters = "a, button, input, textarea, select, [role='button'], h1, h2, h3, p, span, div.tweet-text, article";
            const elements = Array.from(document.querySelectorAll(interactiveFilters));

            let nextId = 1;
            const elementMap: Record<number, string> = {};
            let promptLines: string[] = [];

            for (const el of elements) {
                const rect = el.getBoundingClientRect();
                // Skip hidden out-of-viewport elements
                if (rect.width === 0 || rect.height === 0 || rect.top < 0 || rect.top > window.innerHeight) continue;

                const text = (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).placeholder || "";
                if (!text && el.tagName !== "INPUT") continue;

                // VISUAL MEMORY: Ignore elements that exactly match text we already extracted across any session
                // Also ignore links we have already clicked or visited
                if (visited.some(v => v === text || v === (el as HTMLAnchorElement).href)) continue;

                const tag = el.tagName.toLowerCase();
                const idAttr = el.id ? ` id="${el.id}"` : "";
                const ariaLabel = el.getAttribute("aria-label") ? ` aria-label="${el.getAttribute("aria-label")}"` : "";

                // Tag with ID for Playwright to click later
                el.setAttribute("data-browser-agent-id", nextId.toString());
                elementMap[nextId] = `[data-browser-agent-id="${nextId}"]`;

                promptLines.push(`[${nextId}] <${tag}${idAttr}${ariaLabel}>: ${text.slice(0, 100)}`);
                nextId++;
            }

            return {
                promptText: promptLines.join("\n"),
                elementMap
            };
        }, visitedList);
    }

    /**
     * The core autonomous loop.
     */
    async runTask(url: string, goal: string, maxSteps = 10): Promise<string> {
        if (!this.page) await this.init();

        console.log(`\n🤖 [Browser Agent] Navigating to ${url}...`);
        await this.page!.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

        let finalExtractedData = "";
        let previousActions: string[] = [];
        const visitedUrls = await getVisitedLinks(500);

        for (let step = 1; step <= maxSteps; step++) {
            console.log(`  Step ${step}: Reading DOM...`);
            await this.page!.waitForTimeout(2000); // Let JS framework load

            const snapshot = await this.getPageSnapshot(visitedUrls);
            const screenshotBuffer = await this.page!.screenshot({ type: "jpeg", quality: 50, scale: "css" });
            const imageBase64 = screenshotBuffer.toString("base64");

            console.log(`  Step ${step}: DOM mapped. Found ${Object.keys(snapshot.elementMap).length} interactive elements. Capturing screenshot for Vision LLM...`);

            const prompt = `
You are an expert autonomous web scraper.
Your goal is: "${goal}"

CURRENT VISIBLE DOM ELEMENTS:
${snapshot.promptText}

PAST ACTIONS YOU ALREADY TRIED (Avoid repeating mistakes):
${previousActions.length > 0 ? previousActions.join("\n") : "None yet."}


Decide your next action. You can only do one of the following:
1. "click" an element by its ID number.
2. "type" text into an element by its ID number.
3. "scroll_down" if you need to see more content.
4. "extract" data. Output what you found in the "text" field, and keep exploring or finish.
5. "done" if the goal is fully achieved.

Respond ONLY with strictly valid JSON in this exact format, with no markdown formatting:
{
  "action": "click|type|scroll_down|extract|done",
  "elementId": <number or null>,
  "text": "<text to type or extracted data>",
  "reasoning": "Why you chose this action based on the goal."
}
      `;

            try {
                // Use the core Organism brain with Vision support
                const rawContent = await callBrain(prompt, "Browser Agent Vision Step", false, "chat", imageBase64);

                // Clean markdown block if the model included it despite instructions
                const jsonStr = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
                const call: BrowserAction = JSON.parse(jsonStr);

                console.log(`  🧠 Engine: ${call.action} [${call.elementId || ''}] — ${call.reasoning}`);

                // Save to memory
                previousActions.push(`[Step ${step}] Action: ${call.action}, Element: ${call.elementId || 'none'}, Text: '${call.text || ''}'. Reasoning: ${call.reasoning}`);

                if (call.action === "done") {
                    return finalExtractedData;
                }

                if (call.action === "extract" && call.text) {
                    finalExtractedData += "\n" + call.text;
                    console.log(`  📄 Extracted: ${call.text.slice(0, 50)}...`);
                    try {
                        await markVisited(call.text);
                        visitedUrls.push(call.text);
                    } catch { }
                }

                if (call.action === "scroll_down") {
                    await this.page!.evaluate(() => window.scrollBy(0, window.innerHeight));
                }

                if (call.action === "click" && call.elementId) {
                    const selector = snapshot.elementMap[call.elementId];
                    if (selector) {
                        try {
                            const href = await this.page!.evaluate((sel) => {
                                const el = document.querySelector(sel);
                                return el?.tagName === "A" ? (el as HTMLAnchorElement).href : null;
                            }, selector);
                            if (href) {
                                await markVisited(href);
                                visitedUrls.push(href);
                            }
                        } catch { }
                        await this.page!.click(selector, { force: true });
                    }
                }

                if (call.action === "type" && call.elementId && call.text) {
                    const selector = snapshot.elementMap[call.elementId];
                    if (selector) {
                        try {
                            console.log(`  ⌨️  Typing into [${call.elementId}]: ${call.text.slice(0, 50).replace(/\n/g, " ")}...`);
                            const loc = this.page!.locator(selector).first();
                            await loc.click({ force: true, timeout: 5000 });
                            await loc.focus();
                            await this.page!.waitForTimeout(200);
                            await this.page!.keyboard.insertText(call.text);
                            await this.page!.waitForTimeout(500);
                            await this.page!.keyboard.press('Enter');
                        } catch (err: any) {
                            console.error(`  ⚠️ Could not type into [${call.elementId}]: ${err.message}`);
                        }
                    }
                }

            } catch (err: any) {
                console.error(`  ❌ Error on step ${step}:`, err.message);
                // If JSON parsing fails or selector isn't found, scroll down and try again
                await this.page!.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
            }
        }

        // Default exit if max steps reached
        return finalExtractedData;
    }
}
