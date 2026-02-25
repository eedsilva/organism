# Organism — Autonomous Economic Agent

## Overview

**Organism** is a self-evolving autonomous system designed to detect economic pain, validate demand, build minimal products, and generate revenue with minimal human intervention.

Its core survival rule:

> If it creates value and earns revenue, it lives.
> If it fails to generate revenue, it must adapt and learn or die.

The system runs locally, operates in cycles, and continuously improves its own decision policies based on measurable outcomes.

---

# Core Architecture

## 1. Runtime Model

The organism operates in repeating cycles:

1. Self-check
2. Budget evaluation
3. Environmental sensing
4. Opportunity scoring
5. Planning
6. Decision (pursue / discard)
7. Build or outreach
8. Metrics logging
9. Reflection (periodic)

All state is persisted in PostgreSQL.

---

## 2. Infrastructure

* **PostgreSQL (Docker)** — persistent memory
* **Redis (Docker)** — optional caching
* **Node.js + TypeScript** — execution engine
* **Local LLM (Ollama)** — default brain
* **Cloud LLM (GPT-4o or similar)** — escalation brain
* **Stripe** — revenue signal
* **Next.js (when building products)** — product layer
* **Vercel** — deployment
* **Cloudflare / ngrok** — local exposure

The organism runs entirely on the host machine.

---

# System Modules

## Heartbeat

* Executes at fixed interval.
* Prevents overlapping cycles.
* Logs system state.
* Serves as operational pulse.

---

## Self Diagnostics

Every cycle checks:

* Database connectivity
* Disk access
* Internet access
* Budget state

If diagnostics fail, cycle aborts.

---

## Budget Governor

Tracks daily inference cost.

States:

* `normal`
* `lean`
* `exhausted`

Budget influences:

* Local vs cloud brain usage
* Planning depth
* Reflection frequency

---

## Environmental Sensing

### Hacker News Sensor

Pulls:

* Ask HN threads
* Automation-related discussions
* Alternative-seeking posts

Scores based on:

* Economic friction keywords
* Comment count
* Intent language

### Reddit Sensor (Planned)

Targets:

* r/Entrepreneur
* r/smallbusiness
* r/Contractors
* r/freelance

Searches for:

* “I wish”
* “is there a tool”
* “how do you handle”
* “manual process”
* “too expensive”

Purpose: Capture buyer-language pain.

---

## Opportunity Scoring

Each opportunity receives:

* `pain_score`
* `competition_score` (future)
* `source_weight`
* `viability_score`

Only opportunities above threshold are reviewed.

---

## Planning

The brain generates:

* Underlying pain summary
* Target customer
* Minimal validation strategy
* Monetization hypothesis

Plans are scored programmatically.

---

## Decision Engine

Each opportunity becomes:

* `discarded`
* `reviewed`
* `pursue`

Threshold-based to prevent overbuilding.

---

## Outreach Loop

For high-scoring opportunities:

* Generate post drafts (HN, Reddit, etc.)
* Daily digest report
* Push work to operator (low friction)

Future:

* Automated posting via API

---

## Build Phase

When viability > 60:

Stage 1:

* Preorder page
* Stripe payment link
* Email capture

Stage 2:

* Minimal Next.js app
* Single core feature
* Stripe checkout

Deployment:

* `vercel --prod`

---

## Revenue Loop

Stripe webhook listener:

* On successful payment → record in `metrics_daily`
* Revenue becomes survival metric
* One payment = organism validation event

Revenue is the true heartbeat.

---

## Reflection Engine (Weekly)

After 7 days:

* Analyze opportunity outcomes
* Analyze outreach engagement
* Analyze conversion
* Identify wasted cycles
* Adjust:

  * pain threshold
  * source weights
  * sensing frequency
  * budget allocation

Reflection modifies the `policies` table.

This closes the self-improvement loop.

---

# Survival Principles

1. Kill aggressively (no zombie projects).
2. Validate before building.
3. Preorder before MVP.
4. Limit concurrent builds.
5. Budget is sacred.
6. Revenue > engagement.
7. Adapt hunting grounds if returns decline.

---

# Development Roadmap

### Phase 1

* Reddit sensing
* Daily digest
* Stripe webhook

### Phase 2

* Preorder-first validation
* Automated landing pages

### Phase 3

* Next.js scaffolding
* Production deployment

### Phase 4

* Meta-learning adjustments
* Policy self-modification

---

# Constraints

* Max 1 active build at a time
* Max 3 outreach drafts per day
* Reflection runs weekly
* Daily inference budget enforced

---

# Long-Term Evolution

Eventually the organism should:

* Automatically post to distribution channels
* Deploy without manual CLI intervention
* Manage Stripe lifecycle fully
* Adjust its niche focus dynamically
* Optimize for recurring revenue

At that point, it becomes a self-directed economic entity.

---

# Definition of Alive

The organism is alive when:

* It generates real Stripe payments
* It adapts based on revenue signals
* It prunes failed ideas automatically
* It evolves its own decision policies

Without revenue, it is only simulating life.

---

End of document.
