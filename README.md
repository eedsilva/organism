# Organism

An autonomous economic agent that detects market pain, validates demand, builds minimal products, and measures survival through real revenue.

If it creates value and earns money, it lives.
If it fails to generate revenue, it adapts or dies.

---

## What It Does

Organism runs as a distributed, event-driven automaton through several decoupled components:

1. **Heartbeat Daemon (`kernel/heartbeat.ts`)** – The main loop. Senses market pain across Hacker News, Upwork, and G2, logs opportunities.
2. **LLM Worker Pool (`kernel/workers/llm.ts`)** – Asynchronously scores opportunities, ranks viability, and plans go-to-market strategies using `gpt-4o-mini` to keep costs low.
3. **Validation Worker Pool (`kernel/workers/validation.ts`)** – Concurrently launches preorders (up to \`max_concurrent_validations\`) and builds final products for paying users.
4. **Webhook Server (`kernel/webhook.ts`)** – Captures real-time waitlist signups and broadcasts SSE events to the UI.
5. **Mission Control UI (`mission-control/`)** – The operator dashboard to monitor the organism in real-time.

All state transitions use event-sourcing stored in PostgreSQL.

---

## Architecture

### Runtime

* Node.js (TypeScript)
* Express (Webhook Server & SSE)
* Node.js Worker Threads (for isolated sub-agent Colonies)
* Next.js (Mission Control & generated Product templates)
* Stripe API (Revenue signal)

### The "UI Chassis"
Organism uses a highly optimized, pre-built React/Tailwind/Framer Motion template called `organism-ui-chassis` for product validation. Instead of slowly generating flawed React code for every idea, the LLM generates a simple `chassis.config.json` configuration file that dictates copy, colors, and layout structure—drastically reducing API inference costs and ensuring pixel-perfect output.

---

## Core Concepts

### Opportunity Lifecycle

```
new → queued_for_planning → (discarded | pursue)
pursue → building → (completed | failed | killed)
```

Only high-viability opportunities move forward. The event-sourced state machine logs every transition in `opportunity_events`.

---

### Validation Strategy

The organism does not build first.

It validates in stages:

1. **Signal detection** (Upwork, G2, Hacker News)
2. **Outreach drafts** (Reddit etc.)
3. **Preorder page** (Chassis JSON generation)
4. **Payment/Lead received** (Webhook capture)
5. **Then build MVP** (Full LLM product generation)

One real payment is worth more than 100 signups.

---

### Colony Architecture (Self-Replication)

When an Organism proves successful in a specific niche, it can spawn child sub-agents (**Colonies**).
Instead of heavy Docker containers, colonies use **Node.js Worker Threads** mapped to **isolated PostgreSQL schemas** (`colony_xyz`). This allows parent and children to share infrastructure while operating with mutated, independent environments and policy parameters.

---

## Project Structure

```
/kernel            → Core logic and Event loop
  /workers         → LLM and Validation async pools
/sense             → HN, G2, Upwork sensors
/cognition         → LLM routing (Cloud/Local)
/scripts           → Migrations and utilities
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

Apply the schema and baseline policies. Safe to run multiple times.

```bash
npm run db:migrate
```

### 3. Start the Webhook Server

In a new terminal, start the webhook server to handle incoming lead captures:

```bash
npm run webhook
```

### 4. Start the Organism Heartbeat

In the main terminal, start the daemon (this spins up the LLM and Validation worker pools automatically):

```bash
npm start
```

### 5. Start Mission Control (UI)

In a third terminal, start the operator dashboard to watch the organism work:

```bash
npm run mission-control
```

---

## Configuration

Set up your `.env` file first:

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=organism
DB_PASSWORD=organism
DB_NAME=organism
WEBHOOK_PORT=3001

HEARTBEAT_INTERVAL_MS=15000
OPENAI_API_KEY=sk-...
```

---

## Philosophy

This is a closed-loop economic system.

The goal is not to blindly generate code.
The goal is to create autonomous revenue-generating behavior.

---

## License

Experimental. Use responsibly.
