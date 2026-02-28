# Organism

An autonomous economic agent that detects market pain, validates demand, builds minimal products, and measures survival through real revenue.

If it creates value and earns money, it lives.
If it fails to generate revenue, it adapts or dies.

---

## What It Does

Organism runs as a distributed, event-driven automaton through several decoupled components:

1. **Heartbeat Daemon (`kernel/heartbeat.ts`)** – The main loop. Runs Deep Research, senses market pain across Hacker News, Reddit, Twitter, LinkedIn, G2, and App Reviews. Logs opportunities.
2. **Deep Research Engine (`sense/research.ts`)** – Before each sensing cycle, navigates to Google Trends to find rising topics, then feeds them into ChatGPT to synthesize 5 high-specificity B2B search queries. These queries are passed directly into the Reddit and Twitter sensing modules.
3. **Agentic Browser (`kernel/browserAgent.ts`)** – A Vision-capable autonomous web driver powered by `gpt-4o-mini`. Takes screenshots, reads the DOM, and autonomously decides what to click, type, scroll, or extract from any website.
4. **LLM Worker Pool (`kernel/workers/llm.ts`)** – Asynchronously scores opportunities, ranks viability, and plans go-to-market strategies.
5. **Validation Worker Pool (`kernel/workers/validation.ts`)** – Concurrently launches preorders and builds final products for paying users.
6. **Webhook Server (`kernel/webhook.ts`)** – Captures real-time waitlist signups and broadcasts SSE events to the UI.
7. **Mission Control UI (`mission-control/`)** – The operator dashboard to monitor the organism in real-time.

All state transitions use event-sourcing stored in PostgreSQL.

---

## Architecture

### Runtime

* Node.js (TypeScript)
* Express (Webhook Server & SSE)
* Playwright + Stealth Plugin (Agentic Browser)
* Next.js (Mission Control & generated Product templates)
* Stripe API (Revenue signal)

### Hybrid LLM Routing

Organism uses a **cloud-first, local-fallback** strategy for all LLM calls:

* **Cloud (Primary)**: `gpt-4o-mini` via OpenAI API — used for vision reasoning and all browser agent actions within the daily budget.
* **Local (Fallback)**: Ollama models (e.g., `llama3.2-vision`, `gemma3:12b`) — used when cloud budget is exhausted or as a cost-saving alternative.
* Budget tracking is stored in PostgreSQL and checked before every cloud API call.

### The "UI Chassis"
Organism uses a pre-built React/Tailwind/Framer Motion template called `organism-ui-chassis` for product validation. Instead of slowly generating flawed React code for every idea, the LLM generates a `chassis.config.json` that dictates copy, colors, and layout — drastically reducing API costs.

---

## Core Concepts

### Opportunity Lifecycle

```
new → queued_for_planning → (discarded | pursue)
pursue → building → (completed | failed | killed)
```

Only high-viability opportunities move forward. The event-sourced state machine logs every transition in `opportunity_events`.

---

### Deep Research Pipeline

Every sensing cycle begins by running the research pipeline:

1. **Google Trends** (`sense/trends.ts`) — Playwright navigates to `trends.google.com` and extracts rising B2B-related search queries.
2. **ChatGPT Synthesis** (`sense/research.ts`) — Uses a stored ChatGPT session to inject a persona-engineering prompt enriched with the trending topics. ChatGPT identifies a specific painful niche and generates 5 targeted search queries.
3. **Dynamic Query Injection** — The queries are passed directly into `senseTwitter()` and `senseReddit()` for that cycle.

---

### Persistent Memory (`kernel/memory.ts`)

The agent never re-visits the same link or re-processes the same text snippet. Every URL clicked and every piece of text extracted is stored in the `visited_links` PostgreSQL table and filtered out of subsequent DOM snapshots.

---

### Validation Strategy

The organism does not build first.

It validates in stages:

1. **Deep Research + Signal detection** (Google Trends → ChatGPT → Reddit/Twitter/HN/G2)
2. **Outreach drafts** (Reddit etc.)
3. **Preorder page** (Chassis JSON generation)
4. **Payment/Lead received** (Webhook capture)
5. **Then build MVP** (Full LLM product generation)

One real payment is worth more than 100 signups.

---

### Colony Architecture (Self-Replication)

When an Organism proves successful in a specific niche, it can spawn child sub-agents (**Colonies**).
Instead of heavy Docker containers, colonies use **Node.js Worker Threads** mapped to **isolated PostgreSQL schemas** (`colony_xyz`).

---

## Project Structure

```
/kernel            → Core logic and Event loop
  /workers         → LLM and Validation async pools
  browserAgent.ts  → Agentic Vision Browser
  memory.ts        → PostgreSQL-backed visited-link tracking
/sense             → Sensing modules (HN, G2, Reviews, Twitter, Reddit, LinkedIn)
  research.ts      → Deep Research: Google Trends → ChatGPT → dynamic queries
  trends.ts        → Google Trends Playwright scraper
/cognition         → LLM routing (Cloud/Local hybrid)
/scripts           → Auth session capture, migrations, and utilities
  captureExistingSession.ts → Saves browser sessions from running Chrome
/products          → Generated product artifacts
/state             → DB Schema, policies, event-sourcing routines
/mission-control   → Operator Dashboard UI
/organism-ui-chassis → The Firmware product template
/colonies          → Forked worker thread workspaces
```

---

## Setup & Running

### 1. Start Infrastructure (PostgreSQL)

```bash
npm run infra:start
```

### 2. Run Database Migrations

```bash
npm run db:migrate
```

### 3. Capture Auth Sessions (for Agentic Browser)

Open Chrome in debug mode to allow session capture:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

Log into ChatGPT and Reddit in that Chrome window. Then run:

```bash
npx ts-node scripts/captureExistingSession.ts chatgpt
npx ts-node scripts/captureExistingSession.ts reddit
```

### 4. Start the Webhook Server

```bash
npm run webhook
```

### 5. Start the Organism Heartbeat

```bash
npm start
```

To watch the browser work visually:

```bash
SHOW_BROWSER=true npm start
```

### 6. Start Mission Control (UI)

```bash
npm run mission-control
```

---

## Configuration

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=organism
DB_PASSWORD=organism
DB_NAME=organism
WEBHOOK_PORT=3001

HEARTBEAT_INTERVAL_MS=15000
OPENAI_API_KEY=sk-...
OLLAMA_MODEL=gemma3:12b        # Optional: preferred local model
SHOW_BROWSER=true              # Optional: make browser windows visible
```

---

## Philosophy

This is a closed-loop economic system.

The goal is not to blindly generate code.
The goal is to create autonomous revenue-generating behavior.

---

## License

Experimental. Use responsibly.
