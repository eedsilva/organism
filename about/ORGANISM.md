# Organism V3 — The Silent Hunter

## Overview

**Organism** is a self-evolving autonomous system that detects high-intent B2B economic pain, validates demand through targeted agentic sensing, builds conversion-optimized minimal products, and generates revenue with minimal human intervention.

Its core survival rule:

> If it solves a real problem and captures high-intent leads, it lives.
> If it fails to convert, it kills the idea, adapts, and learns.

The system runs completely autonomously. It is monitored through **Mission Control**, a real-time dashboard that replaces manual intervention.

---

# Core Architecture

## 1. Runtime Model

The organism operates in repeating cycles:

1. Self-check & Environment Boot
2. Budget & Configuration evaluation
3. **Deep Research** (Google Trends → ChatGPT persona synthesis → dynamic queries)
4. Environmental Sensing (6 agentic sources with dynamic queries)
5. Opportunity scoring & selection
6. Planning & Design Generation (LLM as Designer)
7. Decision (pursue / discard)
8. Build & Deploy (Vercel/Render)
9. Direct Outreach (Cold Emails / SEO)
10. Metrics logging & Reflection (periodic)

All state is persisted in PostgreSQL.

---

## 2. Infrastructure

* **PostgreSQL (Docker)** — persistent memory, budget tracking, event-sourcing
* **Node.js + TypeScript** — execution engine
* **Playwright + Stealth Plugin** — Agentic Browser (multi-modal vision)
* **Local LLM (Ollama)** — `gemma3:12b`, `llama3.2-vision` — default processing
* **Cloud LLM (OpenAI GPT-4o-mini)** — vision reasoning, within daily budget
* **ChatGPT Web UI** — Deep Research query synthesis via authenticated session
* **Google Trends** — Rising topic detection via direct Playwright scraping
* **Next.js + Tailwind (organism-ui-chassis)** — product frontend template
* **Vercel / Render API** — automatic remote deployment
* **Resend / SendGrid** — push notifications and cold outreach

---

# System Modules

## Heartbeat

* Executes at fixed interval.
* Prevents overlapping cycles.
* Emits state changes to Mission Control via local API.

---

## Mission Control (The Executive Dashboard)

* **Pipeline View**: Kanban board tracking ideas from Sensing → Validating → Building → Alive/Dead.
* **Metrics View**: Analytics tracking traffic sources and email conversions.
* **Engine Room**: Visual controls for LLM budgets, sensor thresholds, and kill conditions.
* **Push Notifications**: Async daily digest (Telegram/Email) for major events.

---

## Deep Research Engine (`sense/research.ts`)

The most important sensing upgrade. Runs at the start of every cycle before any raw data collection.

**Phase 1 — Google Trends (`sense/trends.ts`)**
* Playwright navigates directly to `trends.google.com/trends/explore`.
* Scrapes the "Rising Queries" section for a random B2B keyword.
* Returns a list of trending topics with momentum.

**Phase 2 — ChatGPT Persona Synthesis**
* Playwright opens ChatGPT using a stored authenticated session.
* Injects a zero-shot psychological profiling prompt:
  * Uses trending topics as grounded context.
  * Asks ChatGPT to identify a specific B2B niche where professionals are furious.
  * Forces output as a JSON array of 5 short, search-engine-friendly queries.
* Queries are max 8 words — optimized for Reddit and Twitter search hit rates.

**Phase 3 — Dynamic Query Injection**
* Generated queries are passed into `senseTwitter()` and `senseReddit()` for that cycle, replacing static hardcoded queries.
* Falls back to local LLM synthesis if ChatGPT session is unavailable.

---

## Environmental Sensing V3 (Agentic Browser)

Organism no longer relies on APIs. It uses a **Vision-capable Agentic Browser** that physically navigates the web like a human.

### BrowserAgent (`kernel/browserAgent.ts`)

The core autonomous loop:

1. Takes a full-page screenshot (JPEG, low-quality for cost efficiency).
2. Maps all visible DOM elements to a numbered list.
3. Calls `gpt-4o-mini` (cloud) or `llama3.2-vision` (local fallback) with the screenshot + element map.
4. Executes the chosen action: `click`, `type`, `scroll_down`, `extract`, or `done`.
5. Repeats until the goal is achieved or max steps reached.

**Self-Correction Memory**: Previous actions are passed back into each subsequent prompt, preventing infinite loops.

**Persistent Link Memory**: Visited URLs and extracted text snippets are stored in the `visited_links` PostgreSQL table and filtered from DOM snapshots — the agent never re-reads the same content.

### Active Sensing Sources

| Source | Module | Auth Required | Custom Queries |
|---|---|---|---|
| Hacker News | `sense/hn.ts` | No | No |
| B2B App Reviews | `sense/reviews.ts` | No | No |
| G2/Capterra | `sense/g2.ts` | No | No |
| Twitter/X | `sense/twitter.ts` | Yes (`.auth/twitter.json`) | ✅ Yes |
| LinkedIn | `sense/linkedin.ts` | Yes (`.auth/linkedin.json`) | No |
| Reddit | `sense/reddit.ts` | Yes (`.auth/reddit.json`) | ✅ Yes |

---

## Hybrid LLM Routing

Every LLM call goes through `cognition/llm.ts` which applies a **cloud-first, local-fallback** strategy:

1. Check daily cloud budget in PostgreSQL. If exhausted → local.
2. Try `gpt-4o-mini` (cloud). On failure → local.
3. For vision tasks → `llama3.2-vision` (local).
4. For text tasks → Configured `OLLAMA_MODEL` (default: `gemma3:12b`).

---

## Self-Improvement (Evolve & Reflect)

* **`kernel/evolve.ts`** — Reads its own source code once per day and proposes code improvements for human review.
* **`kernel/reflect.ts`** — Weekly analysis of which sensing sources produced the most viable opportunities. Adjusts `source_weight` policies in the database.

---

## Opportunity Scoring

Each opportunity receives:

* `pain_score` — intent language and willingness-to-pay signals
* `competitor_weakness_score` — negative review volume
* `viability_score` — composite score

Only opportunities above the threshold (configurable in Mission Control) are reviewed.

---

## The Build Module

When viability is high, Organism deploys a product:

1. Clones the `organism-ui-chassis` template (Next.js, Tailwind, Framer Motion).
2. Calls the **Designer LLM** to generate: Hero Copy, Color Palette, Feature Matrix, Lead Magnet strategy.
3. Injects the output into the chassis config as structured JSON.
4. Deploys via Vercel API. Returns a live URL.

---

# Survival Principles

1. Kill aggressively. 100 targeted views with 0 conversions = death.
2. Build insanely beautiful products; visitors buy with their eyes.
3. Validate demand via direct cold outreach to high-intent targets.
4. Autonomy above all: Mission Control monitors, never micromanages.
5. High-Intent Email capture is the primary oxygen.

---

# Definition of Alive

The organism is alive when:

* It synthesizes research and hunts opportunities without human prompting.
* It deploys polished web apps without human intervention.
* It prunes failed ideas based on analytics data.
* It pushes meaningful updates to Mission Control autonomously.

Without revenue or high-intent validation, it is only simulating life.
