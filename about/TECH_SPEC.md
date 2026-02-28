# Organism V4 — Technical Specification

## 1. Purpose

Organism is a locally running autonomous economic agent that operates on a fast-reaction revenue interception model:

1. Runs a **Displacement Engine** (`sense/displacement/`) to detect B2B SaaS price shocks via Playwright DOM diffing and semantic extraction.
2. Leverages an **Unforgiving Multiplicative Viability Score** (`cognition/viability.ts`) to immediately discard ideas without spend proof.
3. Automatically deploys **Tool Archetypes** (Cost Estimators, Migration Comparators) via Next.js chassis injections (`kernel/build.ts`) onto Vercel.
4. Distributes these tools via **Aged Trust Identities** on Reddit and HN (`scripts/trust-warmup.ts`).
5. Tracks its own **Operator Survival Index (OSI)** and executes a hard kill switch on its own niche thesis at Day 90 if negative (`kernel/thesis.ts`).

---

## 2. Infrastructure & Local Services

* PostgreSQL — Core Event State, Budget Tracking, and Policy configurations
* Node.js (TypeScript) — Brain & Orchestrator (`kernel/cycle.ts`)
* Playwright (`playwright-extra` + stealth plugin) — Agentic DOM diffing, Trust Identity Warmups, Deep Research scraping.
* `organism-ui-chassis` — Source template for generating standalone Next.js deployment tools on the fly.
* OpenAI `gpt-4o-mini` / `gpt-4o` — Cloud inference layer.
* Local Ollama (`deepseek`, `llama3.2-vision`) — Local fallback cluster for cost efficiency when daily cloud budget exhausted.

---

## 3. Database Schema (V4 Additions)

V4 introduces several massive migrations to support the new thesis:

* **displacement_events:** Tracks the origin of a software ecosystem shock (price hike, feature removal).
* **pricing_monitors:** Keeps track of the exact URLs the organism runs weekly DOM hash diffs against.
* **trust_identities & identity_activity_log:** Manages authenticated headless sessions, tracking their age, karma, and 'warmup' status prior to posting links.
* **theses:** The active falsifiable thesis driving the organism. Evaluated by `kernel/thesis.ts`.
* **buyer_communities:** Maps specific roles to their forums (e.g., Shopify devs -> r/Shopify).

---

## 4. Run Sequences

### Core Heartbeat Loop (`kernel/cycle.ts`)
Run continuously via `npm start`. Sequential limits strictly applied to `sensors`.

1. Boot & DB Checks.
2. Signal Queue Processing (Lead sync).
3. Price Shock Checking (Weekly timeout bounds).
4. Cloud Budget Checks.
5. Sensing Modules (Deep Research + Agentic Scrapes).
6. Plan Generation Asynchronously queueing.

### Validation Worker Pool (`kernel/workers/validation.ts`)
Operates concurrently with the Heartbeat via database queues.

1. Processes up to max_concurrent preorders simultaneously.
2. Clones the `organism-ui-chassis` and injects **Tool Archetype** configurations (e.g. `COST_ESTIMATOR`).
3. Executes deploys to Vercel/Render.

### Trust Identity Warmups
Run this script manually whenever you want to add a distribution channel.
\`\`\`bash
npx ts-node scripts/trust-warmup.ts MyRedditThrowaway
\`\`\`

---

## 5. Extensibility

Adding new archetypes requires:
1. Creating a `<NEW>_TEMPLATE` inside `kernel/toolArchetypes/<new>.ts`.
2. Appending it to the switch in `cognition/archetypeSelector.ts`.
3. Making sure the target `organism-ui-chassis` app knows how to render its input dependencies.

Adding new Displacement Monitors requires:
1. `INSERT INTO pricing_monitors (tool_name, pricing_url, niche) VALUES ...` 

---

End of Technical Specification V4.
