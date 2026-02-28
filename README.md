# Organism (V4: The Revenue Interception Engine)

An autonomous economic agent that detects where B2B software spend is currently flowing and intercepts it during **Displacement Events** (price shocks, feature removals) by deploying automated escape hatches faster than any human team.

If it captures high-intent leads and generates revenue, it lives.
If it fails to hit an Operator Survival Index (OSI) within 90 days, it pivots or dies.

---

## What It Does

Organism runs as an event-driven automaton through several decoupled components:

1. **The Displacement Engine (`sense/displacement/`)** – Scans specific B2B niches (e.g., Shopify Apps) for sudden price hikes or feature removals using semantic DOM diffing over Playwright.
2. **Deep Research Engine (`sense/research.ts`)** – Identifies rising topics and constructs dynamic search queries to locate the affected audience via Twitter/Reddit.
3. **Agentic Browser (`kernel/browserAgent.ts`)** – Powered by `gpt-4o-mini`, the Vision agent navigates forums and communities to find the buyers actively complaining about the displacement event.
4. **Tool Archetype Builder (`kernel/toolArchetypes/`)** – Rather than hallucinating SaaS products, the Organism instantly deploys pre-wired `organism-ui-chassis` configurations like Cost Estimators, Validation Forms, or Migration Comparators to capture emails.
5. **Trust Identities (`state/migrations/021_trust_identities.sql`)** – Manages aged and warmed-up accounts on Reddit and HN that can drop links to the newly deployed free tools without being banned.
6. **Mission Control UI (`mission-control/`)** – The OSI dashboard for the operator to monitor the engine’s ROI and active theories.

All state transitions and displacement events are tracked in PostgreSQL.

---

## Architecture

* Node.js (TypeScript) — The Brain / Core Loop
* PostgreSQL — Event-sourcing, budget tracking, displacement events
* Playwright + Stealth Plugin — Agentic Browser & Sensors
* Next.js — Mission Control & `organism-ui-chassis`
* Vercel API — Automated deployments

### Hybrid LLM Routing (`cognition/llm.ts`)

Organism uses a **cloud-first, local-fallback** strategy to respect daily budgets:
* **Cloud (Primary)**: `gpt-4o-mini` (Vision & Chat), `gpt-4o` (Code & Planning)
* **Local (Fallback)**: Ollama (`deepseek`, `qwen2.5-coder`, `llama3.2-vision`) when the specified daily budget is exhausted.

---

## Setup & Running

### 1. Start Infrastructure (PostgreSQL)
\`\`\`bash
npm run infra:start
\`\`\`

### 2. Run Database Migrations
\`\`\`bash
npm run db:migrate
\`\`\`

### 3. Warm Up Trust Identities (V4 Feature)
Account aging is required before distribution:
\`\`\`bash
npx ts-node scripts/trust-warmup.ts YourRedditHandle
\`\`\`

### 4. Start the Webhook Server
\`\`\`bash
npm run webhook
\`\`\`

### 5. Start the Organism Heartbeat
\`\`\`bash
npm start
\`\`\`

### 6. Start Mission Control (UI)
\`\`\`bash
npm run mission-control
\`\`\`

---

## The V4 Falsifiable Thesis
This engine operates on a strict 90-day clock per niche. If the Organism cannot produce a positive return on API capital invested (Operator Survival Index) in 90 days, the active thesis automatically pauses and the system demands a manual pivot.

**The goal is not to blindly generate code. The goal is to intercept revenue.**
