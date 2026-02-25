# Organism

An autonomous economic agent that detects market pain, validates demand, builds minimal products, and measures survival through real revenue.

If it creates value and earns money, it lives.
If it fails to generate revenue, it adapts or dies.

---

## What It Does

Organism runs in continuous cycles:

1. **Self-check** – validates system health
2. **Budget check** – enforces daily inference limits
3. **Sensing** – scans public sources for economic pain
4. **Scoring** – ranks opportunities
5. **Planning** – generates validation strategies
6. **Decision** – pursue or discard
7. **Build / Outreach** – validate demand
8. **Revenue tracking** – Stripe webhook
9. **Reflection** – policy adjustment

All state is persisted in PostgreSQL.

---

## Architecture

### Runtime

* Node.js (TypeScript)
* Express (webhook + landing endpoints)
* Local LLM (Ollama)
* Cloud LLM (optional escalation)

### Infrastructure

* PostgreSQL (Docker)
* Redis (optional)
* Next.js (product layer)
* Vercel (deployment)
* Stripe (revenue signal)

---

## Core Concepts

### Opportunity Lifecycle

```
new → reviewing → (discarded | pursue)
pursue → building → (completed | failed)
```

Only high-viability opportunities move forward.

---

### Validation Strategy

The organism does not build first.

It validates in stages:

1. **Signal detection**
2. **Outreach drafts**
3. **Preorder page (Stripe link)**
4. **Payment received**
5. **Then build MVP**

One real payment is worth more than 100 signups.

---

### Revenue = Survival

Stripe webhook events update `metrics_daily`.

Revenue > 0 means:

* The organism found real value.
* The current hunting strategy works.

No revenue triggers:

* Threshold adjustments
* Sensing expansion
* Budget reduction

---

## Project Structure

```
/kernel        → core loop logic
/sense         → HN, Reddit sensors
/cognition     → LLM integration
/scripts       → migrations / reset
/migrations    → SQL evolution
/products      → generated product artifacts
/state         → schema + DB utilities
```

---

## Setup

### 1. Start Infrastructure

```bash
docker compose up -d
```

### 2. Reset Database (dev)

```bash
docker exec -it organism-postgres psql -U organism -d organism -c "
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
"

docker exec -i organism-postgres psql -U organism -d organism < state/schema.sql
```

### 3. Start Heartbeat

```bash
npx ts-node kernel/heartbeat.ts
```

---

## Environment Variables

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=organism
DB_PASSWORD=organism
DB_NAME=organism

HEARTBEAT_INTERVAL_MS=15000
DAILY_LLM_LIMIT_USD=5
STRIPE_SECRET_KEY=...
```

---

## Reflection Engine (Planned)

Every 7 days:

* Analyze outcomes
* Adjust thresholds
* Reweight sensing sources
* Optimize budget allocation

Policies stored in DB.

The organism modifies its own strategy.

---

## Constraints

* Max 1 active build
* Max 3 outreach drafts per day
* Kill idea after 5 days no traction
* Preorder before MVP
* Budget enforced daily

---

## Current Status

* [x] Heartbeat loop
* [x] Budget governor
* [x] Hacker News sensing
* [x] Reddit sensing
* [ ] Stripe webhook
* [ ] Preorder-first validation
* [ ] Weekly reflection engine

---

## Philosophy

This is not a SaaS starter template.

This is a closed-loop economic system.

The goal is not to build features.
The goal is to create revenue-generating behavior.

---

## License

Experimental. Use responsibly.
