# ORGANISM V4 — THE REVENUE INTERCEPTION ENGINE
### Master Architecture, Strategy & Implementation Guide

> **Core Mission:** Detect where B2B software money is about to move. Build the escape hatch before anyone else knows the window is open. Distribute it through trusted channels faster than any human team can react.

---

## TABLE OF CONTENTS

1. [The Strategic Shift](#1-the-strategic-shift)  
2. [What Is Actually Broken Right Now](#2-what-is-actually-broken-right-now)  
3. [The New Objective Function](#3-the-new-objective-function)  
4. [The Displacement Engine](#4-the-displacement-engine)  
5. [The Multiplicative Viability Score](#5-the-multiplicative-viability-score)  
6. [The Buyer Atlas](#6-the-buyer-atlas)  
7. [The Free Tool Flywheel](#7-the-free-tool-flywheel)  
8. [Tool Archetypes — The Pre-Built Chassis Modes](#8-tool-archetypes--the-pre-built-chassis-modes)  
9. [The Trust Identity System](#9-the-trust-identity-system)  
10. [The Active Thesis — Falsifiable, Versioned, Executable](#10-the-active-thesis--falsifiable-versioned-executable)  
11. [The Reflection Engine Upgrade](#11-the-reflection-engine-upgrade)  
12. [Mission Control — OSI Dashboard](#12-mission-control--osi-dashboard)  
13. [The 96-Hour Clock — Detection to Distribution](#13-the-96-hour-clock--detection-to-distribution)  
14. [Database Schema Additions](#14-database-schema-additions)  
15. [External APIs, Tools & Cost Model](#15-external-apis-tools--cost-model)  
16. [Implementation Sequence](#16-implementation-sequence)  
17. [The 90-Day Falsifiable Thesis](#17-the-90-day-falsifiable-thesis)  
18. [Mobile Strategy](#18-mobile-strategy)  
19. [Colony Architecture — V4 Expansion](#19-colony-architecture--v4-expansion)  
20. [Risk Register](#20-risk-register)

---

## 1. THE STRATEGIC SHIFT

### From Pain Scanner to Budget Flow Radar

The V3 organism asks: **"Where does pain exist?"**

Pain is cheap. Pain is everywhere. Pain without money attached is not a business opportunity — it is content.

The V4 organism asks: **"Where is spend currently flowing, and what event is about to redirect it?"**

This is a different machine. It requires a different objective function, different sensors, different scoring, and a different build pipeline. Everything in V3 that optimized for signal volume must be replaced with systems that optimize for **buyer switch-moments**.

### The Three Properties That Print Money

**1. Displacement** — An external event has shattered the status quo for a group of paying buyers. Price shock, acquisition, feature removal, market gap. The buyers are motivated. They are looking. The window is open.

**2. Spend Proof** — Evidence that these buyers are currently paying for the thing they're about to leave. Not just complaining. Actually paying. "$400/month for 3 years" is a signal. "This is so frustrating" is noise.

**3. Speed Advantage** — You can build and distribute the escape hatch faster than any VC-backed team can spin up a product roadmap meeting. Your moat is not intelligence. It is execution velocity.

### What V4 Becomes

A time-optimized, thesis-bound, event-driven revenue interception engine.

Not the most powerful tool in the market. The fastest one pointed at the right target.

---

## 2. WHAT IS ACTUALLY BROKEN RIGHT NOW

Before building forward, fix what is silently failing. These bugs make the system appear to work while doing nothing.

### Bug 1: Signal Queue Has No Consumer — Leads Are Lost

**Severity: Critical.** The `signal_queue` table receives lead captures from the webhook, G2 data from the browser agent, and Upwork data. Nothing reads it. Every lead that has ever been captured via a deployed landing page is sitting unprocessed in this table.

**Fix:** Create `kernel/workers/signal.ts` that runs at the top of every cycle with `SELECT ... FOR UPDATE SKIP LOCKED`. Process lead events, push G2/review signals into opportunities, notify Mission Control via `pg_notify`.

### Bug 2: Budget Tracking Is Broken — The Guard Never Fires

**Severity: Critical.** `kernel/budgets.ts` reads from `cycles.inference_cost_usd`. Nothing writes to that column. It is always 0. `getBudgetStatus()` always returns `"normal"`. The daily budget limit is completely bypassed.

**Fix:** Delete `budgets.ts`. Replace every call to it with direct reads from `cognition/llm.ts`'s `getTodayCloudSpend()` which correctly tracks from the `events` table.

### Bug 3: Zombie Killer Bypasses Event Sourcing

**Severity: High.** `killZombies()` does `UPDATE opportunities SET status = 'killed'` directly. The `opportunity_current_state` view derives status from `opportunity_events`, not `opportunities.status`. A zombie killed this way still appears as `building` in the view. The validation worker keeps trying to re-process it.

**Fix:** Kill zombies by querying the view, then write state change via `transitionOpportunity()` only.

### Bug 4: View Missing Columns

**Severity: High.** `opportunity_current_state` view doesn't include `seen_count` or `operator_rating`. The `/ideas` CLI command queries both. Throws a column error in production.

**Fix:** Migration `013_view_fix.sql` — `CREATE OR REPLACE VIEW` with all columns included.

### Bug 5: Duplicate Migration Numbers

**Severity: Medium.** Two `007_` files and two `008_` files exist. Rename: `007_telegram.sql` → `013_telegram.sql`, `008_replication.sql` → `014_replication_policies.sql`. Update the `migrations` table for already-applied instances.

### Bug 6: Replication Schema Mismatch

**Severity: Medium.** `replicate.ts` inserts `spec_id` and `source_opportunity_id` columns that don't exist in `replication_log`. Colony spawn throws on first attempt.

**Fix:** Migration `015_replication_log_fix.sql` to add the missing columns.

### Bug 7: LLM Worker `locked` Status Leak

**Severity: Medium.** Worker sets jobs to `status = 'locked'` which is not in the defined enum. On crash, these jobs are stuck permanently. Replace `locked` with `running`. Add recovery query at poll start to reset jobs stuck in `running` for more than 10 minutes.

---

## 3. THE NEW OBJECTIVE FUNCTION

### Old Scoring (Additive, Forgiving)

```
viability_score = pain_score + wtp_score - competition_score
```

This rewards finding complaints. High pain + high wtp scores can compensate for missing spend proof. The organism pursues noise.

### New Scoring (Multiplicative, Unforgiving)

```
Viability = SpendProof × DisplacementStrength × Reachability × BuildSpeed × DistributionFit × WindowUrgency
```

Every term is a float between 0.0 and 1.0. The formula is multiplicative. If **SpendProof = 0**, the entire score is 0. There is no compensation. An opportunity with screaming pain but no evidence of existing spend is discarded immediately.

### Score Thresholds

| Score | Action |
|------:|--------|
| < 0.05 | Auto-discard. Not worth LLM evaluation. |
| 0.05 – 0.15 | Queue for batch scoring, low priority. |
| 0.15 – 0.30 | Pursue if no higher-scoring events exist. |
| 0.30 – 0.50 | High priority. Activate buyer atlas targeting. |
| > 0.50 | Emergency. 96-hour clock starts immediately. |

---

## 4. THE DISPLACEMENT ENGINE

The displacement engine is the most important new module in V4. It replaces generalist pain scanning as the organism's primary intelligence source.

### The Four Displacement Event Types

#### Type 1: PRICE_SHOCK
**What it is:** A SaaS tool raises prices. Affected buyers receive an email on the same day, causing simultaneous search intent surge across every community they inhabit.

**Why it's the best signal:** It is upstream of complaints. You detect it before the first Reddit post appears. The timestamp is exact. The displacement window is predictable.

**How to detect it:**

*Layer 1 — Pricing DOM Diff:*  
Playwright visits pricing pages of 30 monitored tools weekly. Stores a hash of the pricing section. On hash change, triggers semantic analysis.

```typescript
// sense/displacement/priceShock.ts

const MONITORED_TOOLS = [
  { name: "Zapier",        url: "https://zapier.com/pricing",              niche: "automation" },
  { name: "Monday",        url: "https://monday.com/pricing",              niche: "project-management" },
  { name: "Airtable",      url: "https://airtable.com/pricing",            niche: "database" },
  { name: "Notion",        url: "https://www.notion.so/pricing",           niche: "productivity" },
  { name: "Klaviyo",       url: "https://www.klaviyo.com/pricing",         niche: "ecommerce-email" },
  { name: "Gorgias",       url: "https://www.gorgias.com/pricing",         niche: "ecommerce-support" },
  { name: "ReCharge",      url: "https://rechargepayments.com/pricing/",   niche: "ecommerce-subscriptions" },
  { name: "ConnectWise",   url: "https://www.connectwise.com/pricing",     niche: "msp" },
  { name: "Autotask",      url: "https://www.datto.com/products/autotask", niche: "msp" },
  { name: "ServiceTitan",  url: "https://www.servicetitan.com/pricing",    niche: "field-service" },
  { name: "Jobber",        url: "https://getjobber.com/pricing/",          niche: "field-service" },
  { name: "FreshBooks",    url: "https://www.freshbooks.com/pricing",      niche: "accounting" },
  { name: "QuickBooks",    url: "https://quickbooks.intuit.com/pricing/",  niche: "accounting" },
  { name: "Xero",          url: "https://www.xero.com/us/pricing/",        niche: "accounting" },
  { name: "Clio",          url: "https://www.clio.com/pricing",            niche: "legal" },
  { name: "PracticePanther",url: "https://www.practicepanther.com/pricing/",niche: "legal" },
  { name: "HubSpot",       url: "https://www.hubspot.com/pricing",         niche: "crm" },
  { name: "Pipedrive",     url: "https://www.pipedrive.com/en/pricing",    niche: "crm" },
  { name: "Intercom",      url: "https://www.intercom.com/pricing",        niche: "customer-success" },
  { name: "Zendesk",       url: "https://www.zendesk.com/pricing/",        niche: "support" },
];
```

*Layer 2 — Semantic Diff:* Extract dollar amounts. Detect "contact sales" migration. Calculate percentage delta. Detect plan removals. This determines `DisplacementStrength`.

*Layer 3 — Complaint Chatter Confirmation:* After DOM change detected, search Twitter/Reddit/HN for `"[ProductName] price increase"`. Confirms real customer impact and adds to `SpendProof` score when quotes like "been paying $X for 3 years" appear.

**Window half-life:** 30–60 days. `WindowUrgency` starts at 1.0 and decays linearly to 0.3 by day 30.

#### Type 2: ACQUISITION_KILL
Detect via TechCrunch/Crunchbase/Google News + HN spike. Window: 6–18 months.

#### Type 3: FEATURE_REMOVAL
Detect via changelog diffs + sentiment spikes. Window: 60–90 days.

#### Type 4: MARKET_GAP
Detect via job title velocity + GitHub star velocity. Window: 6–24 months.

### The DisplacementEvent Schema

```typescript
export interface DisplacementEvent {
  id: string;
  type: "PRICE_SHOCK" | "ACQUISITION_KILL" | "FEATURE_REMOVAL" | "MARKET_GAP";
  product_or_role: string;

  affected_persona: {
    title: string;
    niche: string;
    estimated_affected: number;
  };

  evidence: { url: string; snippet: string; captured_at: string }[];

  spend_proof_score: number;
  displacement_strength: number;
  window_urgency: number;
  churn_intent_confirmed: boolean;

  detected_at: string;
  window_opens_at: string;
  window_closes_at: string;

  status: "detected" | "validating" | "active" | "expired" | "suppressed";
}
```

### Churn Intent Validation

After any `DisplacementEvent`, run a churn intent check within 72 hours:
- Buyer Atlas communities: “alternatives to X” threads
- Google Trends: “[product] alternative” surge
- Twitter/Reddit: “switching from X” language

If no churn intent in 72h: lower `DisplacementStrength` by 40%, re-check at 7d.  
If confirmed: set `churn_intent_confirmed = true`, multiply `DisplacementStrength` by 1.3, activate the 96h clock.

---

## 5. THE MULTIPLICATIVE VIABILITY SCORE

Includes algorithmic SpendProof (no LLM) + multiplicative computeViability(). (See full spec in this document.)

---

## 6. THE BUYER ATLAS

The Buyer Atlas is the organism's most defensible proprietary asset: where buyers live, and which communities actually convert. (Schema included in this document.)

---

## 7. THE FREE TOOL FLYWHEEL

Free tool earns distribution → relationship stored as activated email list → paid product monetizes relationship. Value first, ask second.

---

## 8. TOOL ARCHETYPES

Five pre-wired chassis modes: VALIDATOR, COST_ESTIMATOR, MIGRATION_COMPARATOR, RISK_SCANNER, DIFF_ANALYZER.

---

## 9. THE TRUST IDENTITY SYSTEM

Warm accounts *before* you need them. Track trust identities, warmup activity, and removal rates. Only trusted accounts post links.

---

## 10. THE ACTIVE THESIS

Falsifiable, versioned, stored in DB, evaluated weekly. Kill signals trigger thesis revision proposals.

---

## 11. THE REFLECTION ENGINE UPGRADE

Reflect at niche/community/archetype level, optimize for Effective OSI and time-to-first-lead.

---

## 12. MISSION CONTROL — OSI DASHBOARD

Primary metric: Effective OSI (30d) and OSI/hr (Revenue - Costs) / OperatorHours.

---

## 13. THE 96-HOUR CLOCK

Detection → tool live → posted into activated communities within 96 hours.

---

## 14. DATABASE SCHEMA ADDITIONS

Includes migrations:
013_view_fix.sql, 014_replication_fix.sql, 015_llm_worker_fix.sql, 016_buyer_atlas.sql, 017_trust_identities.sql, 018_thesis.sql, 019_displacement_events.sql, 020_pricing_monitors.sql, 021_tool_deployments.sql, 022_niche_performance_view.sql

---

## 15. EXTERNAL APIS, TOOLS & COST MODEL

Designed to run initially on ~$11–$17/month with optional scaling tools later.

---

## 16. IMPLEMENTATION SEQUENCE

1) Fix silent failures (this week)  
2) Displacement foundation (week 2)  
3) Price shock detector (week 3)  
4) Buyer atlas (week 4)  
5) Archetypes + free tool output (week 5)  
6) Trust identities (week 6)  
7) Thesis as code (week 7)  
8) OSI + reflection (week 8)

---

## 17. THE 90-DAY FALSIFIABLE THESIS

SMB pro services, PRICE_SHOCK + FEATURE_REMOVAL, explicit success criteria + kill signals.

---

## 18. MOBILE STRATEGY

Web-only for 90 days; PWA minimal; mobile as colony thesis post-day-91.

---

## 19. COLONY ARCHITECTURE — V4 EXPANSION

Spawn specialist colonies when niche proves OSI-positive and repeats in top performer list.

---

## 20. RISK REGISTER

Bot detection, session expiry, deploy failures, identity bans, conversion failure, thesis wrong — each with mitigations.

---

*Document Version: 4.0*  
*Last Updated: 2026-02-28*
