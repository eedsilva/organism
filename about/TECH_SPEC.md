# Organism V3 — Technical Specification

## 1. Purpose

Organism is a locally running autonomous economic agent that:

1. Runs a **Deep Research pipeline** (Google Trends → ChatGPT) to synthesize targeted B2B search queries each cycle.
2. Uses a **Vision-capable Agentic Browser** (Playwright + `gpt-4o-mini`) to physically navigate Reddit, Twitter, LinkedIn, HN, and G2.
3. Acts as an AI Designer/Developer to build conversion-optimized Next.js applications.
4. Automatically deploys apps globally via Vercel/Render APIs.
5. Validates demand through targeted cold outreach and email capture.
6. Is monitored through a visual, local Next.js **Mission Control** dashboard.

---

# 2. Runtime Architecture

## 2.1 Core Loop (Heartbeat, `kernel/cycle.ts`)

Runs via a continuous, non-overlapping background process:

1. Boot & Self-check against PostgreSQL.
2. Daily Digest (push Telegram/Email update if configured).
3. Weekly Reflection (adjust sensor weights from conversion data).
4. Daily Self-improvement (propose code changes via `evolve.ts`).
5. Budget check — abort cycle if cloud budget exhausted.
6. **Deep Research** — Google Trends → ChatGPT → 5 dynamic search queries.
7. Sequential Agentic Sensing (HN, Reviews, G2, Twitter, LinkedIn, Reddit).
8. LLM Scoring & Opportunity Selection.
9. Plan generation (queued to LLM Worker Pool).
10. Build & Deploy (triggered asynchronously by Validation Worker Pool).
11. Self-check diagnostics (DB, disk, internet).

---

# 3. Infrastructure

## 3.1 Local Services (Docker)

* PostgreSQL (Core State, Budget Tracking, Visited Links Memory)

## 3.2 Execution Environment

* Node.js (TypeScript) — The Brain / Loop
* **Playwright** (`playwright-extra` + stealth plugin) — Agentic Browser
* Next.js (Local `localhost:3000`) — Mission Control Dashboard
* `organism-ui-chassis` (Next.js) — Generated remote products
* Vercel API / Render API — Deployment Infrastructure
* OpenAI `gpt-4o-mini` / GPT-4o — Cloud Vision & Reasoning
* Ollama (`gemma3:12b`, `llama3.2-vision`) — Local LLM Fallback
* Resend / SendGrid — Cold Emails & Push Notifications

---

# 4. Database Schema (Core Tables)

## opportunities
* id, source, pain_score, viability_score, status, metadata (JSONB), created_at

## visited_links
* id, url, text_snippet, created_at
* Prevents BrowserAgent from re-visiting URLs or re-extracting identical text.

## llm_spend_daily
* id, model, date, input_tokens, output_tokens, cost_usd
* Used by hybrid LLM router to enforce daily cloud budget limits.

## events
* id, type, payload (JSONB), timestamp
* Event-sourcing log for all agent actions (sense, plan, build, etc.)

## policies
* key (e.g., 'budget_daily', 'kill_threshold', 'source_weights')
* value (JSONB) — configurable from Mission Control at runtime.

---

# 5. Deep Research Engine

## 5.1 Google Trends Scraper (`sense/trends.ts`)

* Playwright launches native Chrome (headless, stealth flags set).
* Navigates to `trends.google.com/trends/explore?q={keyword}` with a random B2B keyword.
* Extracts the "Rising Queries" section of the related queries widget.
* Returns `TrendTopic[]` with keyword and relative score.
* Gracefully degrades if Google's SPA doesn't render the needed section.

## 5.2 ChatGPT Persona Synthesis (`sense/research.ts`)

* Playwright opens `chatgpt.com` using a stored session from `.auth/chatgpt.json`.
* Waits for the `#prompt-textarea` contenteditable div to appear.
* Types the research prompt (with Google Trends context injected) using `page.keyboard.type()`.
* Waits for the stop button to disappear (generation complete).
* Extracts the last assistant message using `[data-message-author-role='assistant']`.
* Parses the JSON array from the response, strips markdown fences, sanitizes escaped quotes.
* Truncates each query to max 8 words for search-engine compatibility.
* Falls back to `callBrain()` (local/cloud LLM) if session is unavailable.

---

# 6. Agentic Browser (`kernel/browserAgent.ts`)

## 6.1 Core Vision Loop

Each step:

1. `page.screenshot()` → JPEG, `quality: 50`, `detail: "low"` for minimum API cost.
2. `getPageSnapshot()` injects JS to map all visible interactive elements to numbered IDs. Annotates each with `id`, `aria-label`, and inner text.
3. Filters DOM elements that match visited URLs or previously extracted text snippets.
4. Calls `callBrain(prompt, "Browser Agent Vision Step", false, "chat", imageBase64)`.
5. Parses JSON action: `click | type | scroll_down | extract | done`.
6. Executes action using Playwright with `locator.click({ force: true })` or `keyboard.insertText()`.
7. Stores action in `previousActions[]` for self-correction context.

## 6.2 Type Action

* Uses `locator.click()` + `locator.focus()` + `keyboard.insertText()` — does NOT use `page.fill()` which is incompatible with React `contenteditable` divs.
* Presses `Enter` after inserting text.

## 6.3 Singleton Pattern

* One shared `Browser` instance (`sharedBrowser`) for the lifetime of a cycle.
* Each sensor creates an isolated `BrowserContext` + `Page` with its own auth session.
* Calling `agent.close()` closes only the context and page, not the shared browser.
* `BrowserAgent.closeSharedBrowser()` is called at cycle end.

---

# 7. Hybrid LLM Routing (`cognition/llm.ts`)

All LLM calls go through `callBrain()`:

1. **Budget Check**: If `sum(cost_usd) >= policy.budget_daily` → skip cloud.
2. **Cloud Route**: `gpt-4o-mini` via OpenAI. Logs tokens & cost to `llm_spend_daily`.
3. **Local Route (Fallback)**: Ollama via `OLLAMA_MODEL` env var (default: `gemma3:12b`).
4. **Vision Fallback**: `llama3.2-vision` for image-bearing requests when cloud is unavailable.

---

# 8. Authentication & Sessions

Sessions are stored as Playwright `storageState` JSON files in `.auth/`.

To capture a session from your running browser:

```bash
# Step 1: Launch Chrome with debugging port open
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Step 2: Log in to the target platform in that Chrome window

# Step 3: Run the capture script
npx ts-node scripts/captureExistingSession.ts chatgpt   # or reddit, linkedin, etc.
```

The `captureExistingSession.ts` script connects to Chrome via CDP, extracts `storageState`, and saves it. The `.auth/` directory is gitignored.

---

# 9. The Build Module (Dynamic Design)

Trigger: `viability_score` > Threshold.

1. **The Chassis**: Clone `organism-ui-chassis` (Next.js 14+, Tailwind, Framer Motion).
2. **The Designer LLM**: Send opportunity context to GPT-4o → Hero Copy, Color Palette, Feature Matrix, Lead Magnet.
3. **Injection**: LLM outputs structured JSON → injected into chassis config.
4. **Deployment**: Vercel API `/v9/projects` → live URL returned.

---

# 10. Mission Control (UI)

* Local Next.js app querying PostgreSQL and the event stream.
* **Kanban view**: opportunities from Sensing → Validating → Building → Alive/Dead.
* **Metrics dashboards**: source conversion rates, LLM spend, cycle history.
* **Control panel**: update `policies` table in real-time (budget, thresholds, weights).

---

# 11. Notifications

Daily async digest via Telegram or Email:

* "Deployed Project X to vercel.app"
* "Killed Project Y (0% conversion on 150 targeted clicks)"
* "Project Z is ALIVE! (8% conversion rate)"
* "Deep Research identified niche: [prior auth automation for small PT clinics]"

---

End of Technical Specification V3.
