# Organism V2 — Technical Specification

## 1. Purpose

Organism is a locally running autonomous economic agent that:

1. Detects validated economic pain from high-intent B2B and freelance sources.
2. Acts as an AI Designer/Developer to build stunning, conversion-optimized Next.js applications using Gemini/GPT-4o.
3. Automatically deploys apps globally via Vercel/Render APIs.
4. Validates demand through targeted cold outreach, SEO, and email capture.
5. Tracks traffic quality via integrated Analytics (Google Analytics / Plausible / PostHog).
6. Is monitored strictly through a visual, local Next.js **Mission Control** dashboard.

---

# 2. Runtime Architecture

## 2.1 Core Loop (Heartbeat)

Runs via a continuous, non-overlapping background process:

1. Boot & Self-check against PostgreSQL.
2. Read configuration from Mission Control overrides.
3. Sensing (Upwork/B2B APIs & Scrapers).
4. LLM Scoring & Opportunity Selection.
5. Design & Copy generation via Advanced LLM (Gemini API).
6. Build & Chassis Injection (Next.js + Tailwind).
7. External Deployment Vercel API.
8. Direct Outreach (Cold Email scheduling via Resend).
9. Wait for Analytics Webhooks / Email Captures.
10. Evaluation & Kill/Live Decision.

---

# 3. Infrastructure

## 3.1 Local Services (Docker)

* PostgreSQL (Core State)
* Redis (Optional fast cache/queue)

## 3.2 Execution Environment

* Node.js (TypeScript) — The Brain / Loop
* Next.js (Local `localhost:3000`) — Mission Control Dashboard
* `organism-ui-chassis` (Next.js) — The generated remote products
* Vercel API / Render API — Deployment Infrastructure
* Gemini API / GPT-4o — Design & Reasoning
* Resend / SendGrid — Cold Emails & Push Notifications
* Google Analytics Data API / Plausible API — Targeted Traffic Verification

---

# 4. Database Schema (Core Tables)

## opportunities

* id
* source (e.g., 'upwork', 'g2')
* target_contact (email/linkedin if applicable)
* pain_score
* viability_score
* status (new, validating, building, alive, dead)
* metadata (JSONB - for source specific data)
* created_at

## deployments

* id
* opportunity_id
* vercel_project_id
* live_url
* design_tokens (JSONB - colors, typography injected)
* created_at

## metrics_validation

* id
* opportunity_id
* date
* traffic_total
* traffic_targeted (verified via UTM/Source)
* emails_captured
* conversion_rate

## policies

* key (e.g., 'budget_daily', 'kill_threshold')
* value (JSONB)

---

# 5. Sensing Layer (The Diet)

## 5.1 Freelance Job Sensor (Upwork/B2B Boards)

Target: Manual tasks being outsourced.
Mechanism:
* RSS or API scraping for specific keywords ("data entry", "pdf to excel", "manual scrape").
* LLM extracts the specific task and evaluates if a micro-SaaS can automate it.
* Extracts contact info (if available) for downstream outreach.

## 5.2 B2B Review Sensor (Shopify, G2, Chrome Web Store, ProductHunt)

Target: 1-star reviews on successful apps.
Mechanism:
* Scrape reviews filtering for 1-2 stars.
* LLM groups complaints to identify a unified "Missing Feature" or "UX Failure".
* Generates an opportunity to build a standalone app solving just that failure.

---

# 6. The Build Module (Dynamic Design)

Trigger: `viability_score` > Threshold.

1. **The Chassis**: Organism clones a local `organism-ui-chassis` template (Next.js 14+, Tailwind, Framer Motion).
2. **The Designer LLM**: Organism sends the opportunity context to Gemini/GPT-4o, prompting for:
   * Hero Copy & Value Proposition.
   * Color Palette (Hex codes).
   * Feature Matrix.
   * Lead Magnet Strategy.
3. **Injection**: The LLM outputs structured JSON, which is injected into the Chassis configuration files.
4. **Deployment**: Organism calls Vercel API `/v9/projects` to create a new project and pushes the code. Return live URL.

---

# 7. The Outreach & Tracking Module

1. **Direct Pitching**: If the source was Upwork, use Resend API to send a highly personalized cold email to the poster with the generated Vercel URL, appending `?utm_source=cold_email`.
2. **Analytics Sync**: The Next.js chassis includes GA/Plausible tracking scripts.
3. **Lead Capture**: The chassis includes an email capture form that POSTs to an Organism webhook or stores directly in PostgreSQL.

---

# 8. Decision Engine (Kill or Live)

Every 24 hours post-deployment, Organism evaluates `metrics_validation`.

Kill Condition (Example):
* `traffic_targeted` > 100 AND `emails_captured` == 0 -> Mark as `dead`. Invoke Vercel API to teardown project.

Live Condition:
* `emails_captured` / `traffic_targeted` > 5% -> Mark as `alive`. Send Push Notification to CEO.

---

# 9. Mission Control (UI)

Replaces Telegram. A local Next.js app querying the PostgreSQL database directly.

Provides:
* **Kanban view** of all opportunities.
* **Metrics dashboards** pulling from Plausible API and local `metrics_validation` table.
* **Control panel** to update the `policies` table in real-time.

---

# 10. Notifications

To maintain autonomy while providing visibility, Organism uses Resend to send a daily asynchronous digest email or a read-only Telegram channel message:
* "Deployed Project X to vercel.app"
* "Killed Project Y (0% conversion on 150 targeted clicks)"
* "Project Z is ALIVE! (8% conversion rate)" 

---

End of Technical Specification.
