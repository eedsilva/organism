// trends.ts — V4 "Money Finder" Trends Sensor
//
// Goal: Google Trends is NOT a discovery engine. In V4 it's a *timing + language refinement sensor*
// that runs off (1) monitored spend surfaces (pricing pages), (2) displacement events, (3) thesis.
// This file is built to be resilient, cheap, and *smell like money*.
//
// Key properties:
// - Dynamic, money-shaped seed generation (tool-specific + displacement + renewal language)
// - Robust scraping with a persistent browser profile (avoids 429 from Google)
// - Scoring heuristics that bias toward switch-moments (alternatives, pricing, renewal, caps, deprecations)
// - Caching (so Trends outages don't crater the cycle)
// - Retry + debug artifacts (optional)
//
// Usage:
//   const topics = await getTrendingB2BNiche({
//     geo: "US",
//     hl: "en-US",
//     // Optional: wire these to your DB layer
//     getActiveThesis: () => db.getActiveThesis(),
//     getPricingMonitors: () => db.getPricingMonitors({ active: true }),
//     getRecentDisplacements: () => db.getDisplacementEvents({ days: 14 }),
//     cache: myCacheImpl,
//     debug: process.env.TRENDS_DEBUG === "1",
//   });
//
// Minimal drop-in: call getTrendingB2BNiche() with no args.
//
// IMPORTANT — Persistent profile:
//   Google Trends 429-blocks fresh headless contexts aggressively.
//   We use launchPersistentContext with a reusable user-data-dir so
//   Google sees a real session with cookies rather than a new bot.
//   On first run this directory is created and Google may redirect to
//   a consent page — subsequent runs (after cookies accumulate) work reliably.

import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Page } from "playwright";
import * as path from "path";
import * as os from "os";

chromium.use(stealthPlugin() as any);

// Persistent profile directory — shared across cycles so cookies accumulate
const PROFILE_DIR =
    process.env.TRENDS_PROFILE_DIR ||
    path.join(os.homedir(), ".organism-trends-profile");

export interface TrendTopic {
    keyword: string;
    score: number; // 0..100 (estimated)
    seed?: string; // which seed produced it
    reason?: string; // why we think it's money-shaped
}

type DisplacementType = "PRICE_SHOCK" | "ACQUISITION_KILL" | "FEATURE_REMOVAL" | "MARKET_GAP";

export interface DisplacementEventLite {
    id: string;
    type: DisplacementType;
    product_or_role: string;
    affected_persona?: { title?: string; niche?: string };
    detected_at?: string;
}

export interface PricingMonitorLite {
    tool_name: string;
    niche?: string;
    pricing_url?: string;
    monitoring_active?: boolean;
}

export interface ActiveThesisLite {
    target_segment?: string;
    displacement_focus?: DisplacementType[];
    buyer_titles?: string[];
    hypothesis?: string;
}

export interface TrendsCache {
    get(key: string): Promise<TrendTopic[] | null>;
    set(key: string, value: TrendTopic[], ttlSeconds: number): Promise<void>;
}

export interface TrendsOptions {
    geo?: string; // default "US"
    hl?: string; // default "en-US"
    maxSeeds?: number; // default 10
    seedsPerRun?: number; // default 4
    maxTopics?: number; // default 12
    ttlSeconds?: number; // default 86400 (24h)
    debug?: boolean;

    // Optional dependency injection (recommended)
    getActiveThesis?: () => Promise<ActiveThesisLite | null>;
    getPricingMonitors?: () => Promise<PricingMonitorLite[]>;
    getRecentDisplacements?: (days: number) => Promise<DisplacementEventLite[]>;

    // Optional caching
    cache?: TrendsCache;
}

// ----------------------------
// Money-shaped language model (heuristics)
// ----------------------------

const MONEY_INTENT_PATTERNS: Array<{ re: RegExp; w: number; reason: string }> = [
    { re: /\balternatives?\b/i, w: 22, reason: "alternatives (active switching)" },
    { re: /\breplacement\b/i, w: 18, reason: "replacement (switch intent)" },
    { re: /\bswitch(ing)?\b/i, w: 16, reason: "switching language" },
    { re: /\bmigrat(e|ion|ing)\b/i, w: 16, reason: "migration language" },
    { re: /\bnew pricing\b/i, w: 18, reason: "pricing change" },
    { re: /\bprice (increase|hike|raise|raised)\b/i, w: 22, reason: "price shock" },
    { re: /\bcontact sales\b/i, w: 20, reason: "stealth enterprise-gating" },
    { re: /\benterprise\b/i, w: 10, reason: "enterprise gating" },
    { re: /\busage cap\b/i, w: 18, reason: "usage caps" },
    { re: /\blimit(s|ed)\b/i, w: 8, reason: "limits/caps" },
    { re: /\bsunset(ted|ting)?\b/i, w: 18, reason: "sunset (removal)" },
    { re: /\bdeprecated\b/i, w: 16, reason: "deprecation (removal)" },
    { re: /\bremoved feature\b/i, w: 16, reason: "feature removal" },
    { re: /\brenewal\b/i, w: 14, reason: "renewal window (money moves)" },
    { re: /\bcontract renewal\b/i, w: 16, reason: "renewal trigger" },
];

const JUNK_PATTERNS: RegExp[] = [
    /\bnear me\b/i,
    /\bmeaning\b/i,
    /\blyrics\b/i,
    /\bmeme\b/i,
    /\bmovie\b/i,
    /\bcelebrity\b/i,
    /\bwallpaper\b/i,
    /\bfree\b/i,
    /\bdownload\b/i,
    /\bpromo code\b/i,
    /\bdiscount\b/i,
    /\bcoupon\b/i,
];

function looksLikeJunk(q: string): boolean {
    const s = q.trim();
    if (s.length < 6) return true;
    if (s.length > 200) return true;
    if (JUNK_PATTERNS.some(re => re.test(s))) return true;
    // Single token queries are usually too broad
    if (!s.includes(" ") && s.length < 10) return true;
    return false;
}

function moneySmellScore(q: string): { bonus: number; reasons: string[] } {
    let bonus = 0;
    const reasons: string[] = [];
    for (const p of MONEY_INTENT_PATTERNS) {
        if (p.re.test(q)) {
            bonus += p.w;
            reasons.push(p.reason);
        }
    }
    // A light penalty for purely generic "software" queries
    if (/^\w+\s+software$/i.test(q)) bonus -= 8;

    // Clamp
    bonus = Math.max(0, Math.min(40, bonus)); // keep it a modifier, not the entire score
    return { bonus, reasons };
}

// ----------------------------
// Google Trends parsing helpers
// ----------------------------

function parseScoreFromRawText(text: string): number {
    // Google often shows "Breakout" or "+500%".
    const lower = text.toLowerCase();
    if (lower.includes("breakout")) return 100;

    const pctMatch = text.match(/\+?\s*([\d,]+)\s*%/);
    if (pctMatch) {
        const raw = Number(pctMatch[1].replace(/,/g, ""));
        // normalize with log scaling: 100% -> ~20, 500% -> ~55, 1000% -> ~70, 5000% -> 100
        const normalized = Math.min(100, Math.round(Math.log10(raw + 1) * 40));
        return Math.max(15, normalized);
    }

    // If we can't parse, treat as medium-low signal.
    return 25;
}

async function waitForTrendsReady(page: Page): Promise<void> {
    // Wait for the Trends widget custom elements to appear in the DOM.
    // Using custom element names (locale-independent) rather than inner text.
    const selectorRace = Promise.race([
        page.waitForSelector("widget", { timeout: 20000 }).catch(() => null),
        page.waitForSelector("trends-widget", { timeout: 20000 }).catch(() => null),
    ]);

    // Parallel fallback: wait for body length to exceed chart-only content (~2000)
    // Related Queries widgets push body to 4000+ chars when rendered
    const bodyLengthGuard = page.waitForFunction(
        () => (document.body?.innerText?.length ?? 0) > 4000,
        { timeout: 20000 }
    ).catch(() => null);

    await Promise.race([selectorRace, bodyLengthGuard]);

    // Extra settle time for lazy-rendered Related Queries widgets
    await page.waitForTimeout(5000);
}

type ExtractedItem = { keyword: string; raw: string };

async function extractRisingCandidates(page: Page, debug: boolean): Promise<ExtractedItem[]> {
    // Actual Trends DOM (confirmed via headed browser):
    // <widget> contains <tr> rows where innerText is structured as:
    //   "1\n[keyword text]\nBreakout\nmore_vert"
    //   "2\n[keyword text]\n+500%\nmore_vert"
    //
    // The row index is on line 0, the keyword on line 1, the score on line 2.

    // Dump a sample of widget tr innerTexts in debug mode
    if (debug) {
        const diagnostics = await page.evaluate(() => {
            const allRows = Array.from(document.querySelectorAll("widget tr, trends-widget tr"));
            const samples = allRows.slice(0, 10).map(el => (el as HTMLElement).innerText?.slice(0, 200) ?? "");
            return {
                bodyLen: document.body?.innerText?.length ?? 0,
                widgetCount: document.querySelectorAll("widget").length,
                trendsWidgetCount: document.querySelectorAll("trends-widget").length,
                widgetTrCount: allRows.length,
                bodySlice: document.body?.innerText?.slice(1200, 2800) ?? "",
                samples,
            };
        });
        console.log("  🔬 [Trends debug] body len:", diagnostics.bodyLen,
            "| widgets:", diagnostics.widgetCount,
            "| trends-widgets:", diagnostics.trendsWidgetCount,
            "| widget tr count:", diagnostics.widgetTrCount);
        console.log("  🔬 [Trends debug] body slice [1200-2800]:", JSON.stringify(diagnostics.bodySlice));
        console.log("  🔬 [Trends debug] sample widget tr rows:",
            JSON.stringify(diagnostics.samples, null, 2));
    }

    // Strategy A: Parse body.innerText directly.
    // The body text contains the Related Queries section in a consistent structure:
    //   "Related queries\nhelp_outline\nRising\n...\n1\n[keyword]\nBreakout\nmore_vert\n2\n[keyword]\n+500%\n..."
    // This is the most reliable strategy since it doesn't depend on DOM element structure.
    const a = await page.evaluate(() => {
        const results: Array<{ keyword: string; raw: string }> = [];
        const seen = new Set<string>();

        const bodyText = document.body?.innerText ?? "";

        // Find the "Related queries" section — use Rising sub-section
        const risingMatch = bodyText.match(
            /related queries[\s\S]*?rising[\s\S]*?(?=showing \d+-\d+ of \d+ queries|$)/i
        );
        if (!risingMatch) return results;

        const section = risingMatch[0];
        const lines = section.split("\n").map(l => l.trim()).filter(Boolean);

        // Walk lines: index number → keyword → score → "more_vert" pattern
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            // A row index: pure number
            if (/^\d+$/.test(line) && i + 2 < lines.length) {
                const keyword = lines[i + 1];
                const score = lines[i + 2];
                if (
                    keyword &&
                    keyword.length >= 4 &&
                    keyword.length <= 200 &&
                    /breakout|\+\s*\d+%/i.test(score)
                ) {
                    const k = keyword.toLowerCase();
                    if (!seen.has(k)) {
                        seen.add(k);
                        results.push({ keyword, raw: `${line}\n${keyword}\n${score}` });
                    }
                    i += 3;
                    continue;
                }
            }
            i++;
        }

        return results.slice(0, 20);
    });

    if (a.length > 0) return a;

    // Strategy B: DOM scan — widget tr rows with Breakout/+% in the score cell
    const b = await page.evaluate(() => {
        const results: Array<{ keyword: string; raw: string }> = [];
        const seen = new Set<string>();

        const widgets = Array.from(document.querySelectorAll("widget, trends-widget"));
        const queryWidget = widgets.find(w =>
            /related queries/i.test(w.textContent || "")
        );
        const root = queryWidget ?? document;

        root.querySelectorAll("tr").forEach(row => {
            const raw = (row as HTMLElement).innerText?.trim();
            if (!raw) return;

            const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) return;

            const firstIsIndex = /^\d+$/.test(lines[0]);
            const keyword = firstIsIndex ? lines[1] : lines[0];
            const scoreRaw = firstIsIndex ? lines[2] ?? "" : lines[1] ?? "";

            if (!keyword || keyword.length < 4 || keyword.length > 200) return;
            if (!/breakout|\+\s*\d+%/i.test(scoreRaw)) return;

            const k = keyword.toLowerCase();
            if (seen.has(k)) return;
            seen.add(k);
            results.push({ keyword, raw });
        });

        return results.slice(0, 20);
    });

    if (b.length > 0) return b;

    // Strategy C: Broader DOM scan — any tr/li containing Breakout/+% anywhere
    const c = await page.evaluate(() => {
        const candidates: Array<{ keyword: string; raw: string }> = [];
        const seen = new Set<string>();

        document.querySelectorAll("tr, li").forEach(el => {
            const raw = (el as HTMLElement).innerText?.trim();
            if (!raw || raw.length > 400) return;
            if (!/breakout|\+\s*\d+%/i.test(raw)) return;

            const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) return;

            const firstIsIndex = /^\d+$/.test(lines[0]);
            const keyword = firstIsIndex ? lines[1] : lines[0];
            if (!keyword || keyword.length < 4 || keyword.length > 200) return;

            const k = keyword.toLowerCase();
            if (seen.has(k)) return;
            seen.add(k);
            candidates.push({ keyword, raw });
        });

        return candidates.slice(0, 20);
    });

    return c;
}

// ----------------------------
// Seed generation (V4 money finder)
// ----------------------------

const FALLBACK_SEEDS: string[] = [
    // Displacement language
    "price increase",
    "new pricing",
    "pricing change",
    "contact sales",
    "usage cap",
    "sunsetting plan",
    "deprecated feature",
    "removed feature",
    // Switch language
    "alternatives to",
    "switching from",
    "migrating from",
    // Renewal language
    "subscription renewal",
    "contract renewal",
];

function uniq(arr: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of arr) {
        const k = s.trim().toLowerCase();
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s.trim());
    }
    return out;
}

function seedPriorityScore(seed: string): number {
    let score = 0;
    if (seed.split(" ").length >= 3) score += 5;
    const ms = moneySmellScore(seed);
    score += ms.bonus;
    if (/price|pricing|renewal|alternative|switch|migrat|contact sales|sunset|deprecat|cap/i.test(seed)) score += 10;
    if (seed.length > 35) score += 3;
    return score;
}

function buildSeeds(params: {
    thesis?: ActiveThesisLite | null;
    monitors?: PricingMonitorLite[];
    displacements?: DisplacementEventLite[];
    maxSeeds: number;
}): string[] {
    const { thesis, monitors = [], displacements = [], maxSeeds } = params;

    const toolNames = uniq(
        monitors
            .filter(m => m.monitoring_active !== false)
            .map(m => m.tool_name)
            .filter(Boolean)
    );

    const buyerTitles = uniq((thesis?.buyer_titles || []).filter(Boolean));
    const displacementTools = uniq(displacements.map(d => d.product_or_role).filter(Boolean));

    const toolSeeds: string[] = [];
    for (const tool of uniq([...toolNames, ...displacementTools]).slice(0, 20)) {
        toolSeeds.push(`${tool} price increase`);
        toolSeeds.push(`${tool} new pricing`);
        toolSeeds.push(`${tool} pricing change`);
        toolSeeds.push(`${tool} contact sales`);
        toolSeeds.push(`${tool} alternatives`);
        toolSeeds.push(`switching from ${tool}`);
    }

    const personaSeeds: string[] = [];
    for (const title of buyerTitles.slice(0, 10)) {
        personaSeeds.push(`${title} software`);
        personaSeeds.push(`${title} tools pricing`);
        personaSeeds.push(`${title} workflow tool`);
    }

    const eventSeeds = [...FALLBACK_SEEDS];

    const all = uniq([...toolSeeds, ...personaSeeds, ...eventSeeds]);
    const ranked = all
        .map(s => ({ s, p: seedPriorityScore(s) }))
        .sort((a, b) => b.p - a.p)
        .map(x => x.s);

    return ranked.slice(0, maxSeeds);
}

// ----------------------------
// Main function
// ----------------------------

export async function getTrendingB2BNiche(options: TrendsOptions = {}): Promise<TrendTopic[]> {
    const geo = options.geo ?? "US";
    const hl = options.hl ?? "en-US";
    const maxSeeds = options.maxSeeds ?? 10;
    const seedsPerRun = options.seedsPerRun ?? 4;
    const maxTopics = options.maxTopics ?? 12;
    const ttlSeconds = options.ttlSeconds ?? 60 * 60 * 24;
    const debug = options.debug ?? (process.env.TRENDS_DEBUG === "1");

    // 1) Gather dynamic inputs
    const thesis = options.getActiveThesis ? await options.getActiveThesis().catch(() => null) : null;
    const monitors = options.getPricingMonitors ? await options.getPricingMonitors().catch(() => []) : [];
    const displacements = options.getRecentDisplacements
        ? await options.getRecentDisplacements(14).catch(() => [])
        : [];

    // 2) Build "money-shaped" seeds
    const seeds = buildSeeds({ thesis, monitors, displacements, maxSeeds });

    const shuffled = [...seeds].sort(() => Math.random() - 0.5);
    const runSeeds = shuffled.slice(0, Math.min(seedsPerRun, shuffled.length));

    const cacheKey = `trends:v4:${geo}:${hl}:${runSeeds.join("|").toLowerCase()}`;
    if (options.cache) {
        const cached = await options.cache.get(cacheKey);
        if (cached && cached.length) {
            if (debug) console.log(`  🧠 [Trends] Cache hit (${cached.length})`);
            return cached.slice(0, maxTopics);
        }
    }

    console.log(`  🔍 [Trends] Seeds (money-shaped): ${runSeeds.map(s => `"${s}"`).join(", ")}`);
    if (debug) console.log(`  🗂️  [Trends] Using persistent profile: ${PROFILE_DIR}`);

    // 3) Scrape using a persistent context so Google doesn't 429 us.
    //    A fresh headless context gets blocked immediately; a reused profile
    //    with accumulated cookies is treated as a real user.
    const launchOpts: Parameters<typeof chromium.launchPersistentContext>[1] = {
        headless: true,
        ignoreDefaultArgs: ["--enable-automation"],
        args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
        ],
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        locale: hl,
    };

    if (process.env.CHROME_PATH) {
        launchOpts.executablePath = process.env.CHROME_PATH;
    } else if (process.env.CHROME_CHANNEL) {
        (launchOpts as any).channel = process.env.CHROME_CHANNEL;
    }

    const context = await chromium.launchPersistentContext(PROFILE_DIR, launchOpts);
    const page = await context.newPage();
    page.setDefaultTimeout(25000);

    const aggregated = new Map<string, TrendTopic>();

    try {
        for (const seed of runSeeds) {
            const url = `https://trends.google.com/trends/explore?q=${encodeURIComponent(seed)}&geo=${encodeURIComponent(geo)}&hl=${encodeURIComponent(hl)}`;
            if (debug) console.log(`  🌐 [Trends] Visiting: ${url}`);

            let lastErr: any = null;

            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    await page.goto(url, { waitUntil: "domcontentloaded" });
                    await waitForTrendsReady(page);

                    const rising = await extractRisingCandidates(page, debug);

                    if (debug) console.log(`  📈 [Trends] Rising candidates for "${seed}": ${rising.length}`);

                    for (const item of rising) {
                        const keyword = item.keyword.trim();
                        if (!keyword || looksLikeJunk(keyword)) continue;

                        const base = parseScoreFromRawText(item.raw);
                        const smell = moneySmellScore(keyword);
                        const score = Math.max(0, Math.min(100, base + smell.bonus));

                        const key = keyword.toLowerCase();
                        const prev = aggregated.get(key);

                        if (!prev || score > prev.score) {
                            aggregated.set(key, {
                                keyword,
                                score,
                                seed,
                                reason: smell.reasons.slice(0, 3).join(", "),
                            });
                        }
                    }

                    break;
                } catch (err: any) {
                    lastErr = err;
                    if (debug) console.warn(`  ⚠️ [Trends] Attempt ${attempt} failed for "${seed}": ${err.message}`);

                    if (debug) {
                        try {
                            await page.screenshot({ path: `./trends_fail_${Date.now()}.png`, fullPage: true });
                        } catch { }
                    }
                    await page.waitForTimeout(1200 * attempt);
                }
            }

            if (lastErr) {
                // Always warn — not gated by debug (silent failures waste cycles)
                console.warn(`  ⚠️ [Trends] Seed "${seed}" ultimately failed: ${lastErr.message}`);
                if (debug) console.warn(`  ⚠️ [Trends] Stack:`, lastErr.stack);
            }
        }
    } finally {
        await page.close();
        await context.close();
    }

    // 4) Post-process + rank
    const topics = Array.from(aggregated.values())
        .filter(t => !looksLikeJunk(t.keyword))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.keyword.length - a.keyword.length;
        })
        .slice(0, maxTopics);

    // 5) Cache
    if (options.cache) {
        await options.cache.set(cacheKey, topics, ttlSeconds).catch(() => undefined);
    }

    console.log(
        `  💰 [Trends] Money-shaped topics:`,
        topics.map(t => `${t.keyword} (${t.score})`).join(" | ") || "(none this cycle)"
    );

    return topics;
}

// ----------------------------
// Optional: simple in-memory cache adapter (for local dev)
// ----------------------------

export class MemoryTrendsCache implements TrendsCache {
    private store = new Map<string, { exp: number; value: TrendTopic[] }>();

    async get(key: string): Promise<TrendTopic[] | null> {
        const hit = this.store.get(key);
        if (!hit) return null;
        if (Date.now() > hit.exp) {
            this.store.delete(key);
            return null;
        }
        return hit.value;
    }

    async set(key: string, value: TrendTopic[], ttlSeconds: number): Promise<void> {
        this.store.set(key, { exp: Date.now() + ttlSeconds * 1000, value });
    }
}