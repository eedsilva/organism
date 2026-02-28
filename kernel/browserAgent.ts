import { chromium } from "playwright-extra";
import type { Browser, BrowserContext, Page } from "playwright";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(stealthPlugin());
import { ChatOllama } from "@langchain/ollama";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

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
    private llm: ChatOllama;
    private authFile: string | null = null;

    constructor(sessionName?: string) {
        if (sessionName) {
            this.authFile = path.join(__dirname, `../.auth/${sessionName}.json`);
        }

        this.llm = new ChatOllama({
            baseUrl: "http://localhost:11434", // Local Ollama server
            model: process.env.OLLAMA_MODEL || "deepseek-v3.1:671b-cloud",
            temperature: 0.1, // Low temp for structured robotic tasks
            format: "json",
        });
    }

    async init() {
        if (!sharedBrowser) {
            sharedBrowser = await chromium.launch({ headless: true });
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
    private async getPageSnapshot(): Promise<{ promptText: string; elementMap: Record<number, string> }> {
        if (!this.page) throw new Error("Browser not initialized");

        return await this.page.evaluate(() => {
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

                const tag = el.tagName.toLowerCase();

                // Tag with ID for Playwright to click later
                el.setAttribute("data-browser-agent-id", nextId.toString());
                elementMap[nextId] = `[data-browser-agent-id="${nextId}"]`;

                promptLines.push(`[${nextId}] <${tag}>: ${text.slice(0, 100)}`);
                nextId++;
            }

            return {
                promptText: promptLines.join("\n"),
                elementMap
            };
        });
    }

    /**
     * The core autonomous loop.
     */
    async runTask(url: string, goal: string, maxSteps = 10): Promise<string> {
        if (!this.page) await this.init();

        console.log(`\n🤖 [Browser Agent] Navigating to ${url}...`);
        await this.page!.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

        let finalExtractedData = "";

        for (let step = 1; step <= maxSteps; step++) {
            console.log(`  Step ${step}: Reading DOM...`);
            await this.page!.waitForTimeout(2000); // Let JS framework load

            const snapshot = await this.getPageSnapshot();
            console.log(`  Step ${step}: DOM mapped. Found ${Object.keys(snapshot.elementMap).length} interactive elements. Sending to LLM...`);

            const prompt = `
You are an autonomous browser agent. Your goal is: "${goal}"

CURRENT VISIBLE ELEMENTS:
${snapshot.promptText}

Decide your next action. You can only do one of the following:
1. "click" an element by its ID number.
2. "type" text into an element by its ID number.
3. "scroll_down" if you need to see more content.
4. "extract" data. Output what you found in the "text" field, and keep exploring or finish.
5. "done" if the goal is fully achieved.

Respond ONLY with valid JSON in this format:
{
  "action": "click|type|scroll_down|extract|done",
  "elementId": <number or null>,
  "text": "<text to type or extracted data>",
  "reasoning": "Why you chose this action based on the goal."
}
      `;

            try {
                console.log(`  Step ${step}: Awaiting LLM decision from ${this.llm.model}...`);
                const response = await this.llm.invoke([
                    new SystemMessage("You are an expert autonomous web scraper. Always respond in JSON."),
                    new HumanMessage(prompt)
                ]);

                const rawContent = response.content as string;
                // Clean markdown block if present
                const jsonStr = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
                const call: BrowserAction = JSON.parse(jsonStr);

                console.log(`  🧠 Engine: ${call.action} [${call.elementId || ''}] — ${call.reasoning}`);

                if (call.action === "done") {
                    return finalExtractedData;
                }

                if (call.action === "extract" && call.text) {
                    finalExtractedData += "\n" + call.text;
                    console.log(`  📄 Extracted: ${call.text.slice(0, 50)}...`);
                }

                if (call.action === "scroll_down") {
                    await this.page!.evaluate(() => window.scrollBy(0, window.innerHeight));
                }

                if (call.action === "click" && call.elementId) {
                    const selector = snapshot.elementMap[call.elementId];
                    if (selector) await this.page!.click(selector, { force: true });
                }

                if (call.action === "type" && call.elementId && call.text) {
                    const selector = snapshot.elementMap[call.elementId];
                    if (selector) {
                        await this.page!.fill(selector, call.text, { force: true });
                        await this.page!.press(selector, 'Enter');
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
