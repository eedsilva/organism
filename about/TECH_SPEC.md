# Organism — Technical Specification

## 1. Purpose

Organism is a locally running autonomous economic agent that:

1. Detects economic pain from public sources.
2. Scores and ranks opportunities.
3. Validates demand via outreach and preorder.
4. Builds minimal products.
5. Tracks revenue via Stripe.
6. Adjusts its own decision policies weekly.

All execution occurs on a single host machine.

---

# 2. Runtime Architecture

## 2.1 Core Loop (Heartbeat)

Runs every `N` seconds:

1. Self-check
2. Budget check
3. Sensing
4. Scoring
5. Selection
6. Planning
7. Decision
8. Build / Outreach
9. Log metrics

No overlapping cycles allowed.

---

# 3. Infrastructure

## 3.1 Local Services (Docker)

* PostgreSQL
* Redis (optional cache)

## 3.2 Execution Environment

* Node.js (TypeScript)
* Express (for webhook + landing)
* Next.js (product layer)
* Vercel (deployment)
* Stripe (payments)
* Ollama (local LLM)
* Cloud LLM (escalation only)

---

# 4. Database Schema (Core Tables)

## opportunities

* id
* source
* title
* evidence_url (unique)
* pain_score
* competition_score
* viability_score
* status
* created_at

## events

* id
* type
* payload (JSONB)
* created_at

## metrics_daily

* date
* revenue_usd
* signups
* outreach_posts
* conversions

## policies

* key
* value (JSONB)

## actions

* opportunity_id
* type
* status

---

# 5. Sensing Layer

## 5.1 Hacker News

Source:
Algolia API

Signal extraction:

* automation
* alternative
* manual process
* expensive
* workflow

Pain scoring:

* keyword weights
* comment count weight

## 5.2 Reddit (Planned)

Subreddits:

* r/Entrepreneur
* r/smallbusiness
* r/Contractors
* r/freelance

Search terms:

* "I wish"
* "is there a tool"
* "how do you handle"
* "manual"
* "spreadsheet"
* "too expensive"

---

# 6. Opportunity Lifecycle

States:

* new
* reviewing
* discarded
* pursue
* building
* completed
* failed

Flow:

new → reviewing → (discarded | pursue)
pursue → building → (completed | failed)

---

# 7. Scoring Model

## pain_score

Keyword + engagement-based.

## competition_score

Mentions of known SaaS competitors.

## viability_score

pain_score * source_weight - competition_score

Only viability_score ≥ threshold triggers pursue.

Threshold stored in policies table.

---

# 8. Planning

LLM generates:

* pain summary
* ICP (ideal customer profile)
* validation strategy
* monetization model

Plan scored programmatically.

Cloud escalation only if viability_score high.

---

# 9. Outreach Module

For viable opportunities:

* Generate:

  * Reddit draft
  * HN draft
  * Short-form post

* Store in events.

* Daily digest printed to terminal.

Future:
Automated posting via API.

---

# 10. Build Module

Trigger condition:
viability_score ≥ 60

Stage 1:

* Preorder landing page
* Stripe payment link
* Email capture
* Deployed locally

Stage 2:

* Next.js app scaffold
* Single core feature
* Stripe checkout
* Vercel deployment

Only 1 active build allowed at a time.

---

# 11. Revenue Loop

Stripe webhook endpoint:

POST /webhook/stripe

On payment:

* increment revenue_usd
* increment conversions
* mark opportunity as validated

Revenue > 0 = survival event.

---

# 12. Reflection Engine (Weekly)

Reads last 7 days:

* opportunity outcomes
* outreach engagement
* conversion rates
* revenue

Brain asked:

* What signals correlate with revenue?
* What sensing source underperforms?
* Should thresholds change?

Updates policies table.

---

# 13. Budget System

Tracks:

* Daily LLM spend
* Local vs cloud calls

Modes:

* normal
* lean
* exhausted

Budget affects:

* Brain selection
* Reflection frequency
* Sensing depth

---

# 14. Constraints

* Max 1 active product
* Max 3 outreach drafts/day
* Kill idea after 5 days no traction
* Reflection weekly only
* Preorder before MVP

---

# 15. Survival Definition

Organism is alive when:

* Stripe revenue recorded
* Policies evolve based on outcomes
* Failed ideas pruned automatically

Without revenue:

* Budget reduces
* Sensing widens
* Threshold lowers
* Eventually halts

---

End of Technical Specification.
