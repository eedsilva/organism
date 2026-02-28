# Organism V4 — The Revenue Interception Engine

## Overview

**Organism V4** shifts the entire architecture from a "Pain Scanner" (V3) to a "Budget Flow Radar."

Pain is cheap. Pain is everywhere. Pain without money attached is not a business opportunity — it is content. 
The V4 organism asks: **"Where is spend currently flowing, and what event is about to redirect it?"**

Its core survival rule:
> If it intercepts high-intent buyers and generates revenue within 90 days, it lives.
> If it fails to maintain a positive Operator Survival Index (OSI), it automatically kills the active thesis and pivots.

---

# Core Architecture

## 1. Runtime Model

The organism operates on a 96-hour interception clock:

1. **Displacement Detection:** `sense/displacement/` scans monitored tools (e.g., Shopify ecosystem) for pricing changes or feature removals.
2. **Churn Intent Validation:** The agentic browser confirms users are actively looking to churn on Twitter/Reddit.
3. **Emergency Viability Scoring:** Multiplicative, unforgiving score (SpendProof × DisplacementStrength × Reachability...).
4. **Archetype Injection:** Instead of hallucinating full software, it selects a Tool Archetype (Cost Estimator, Validation Form, etc.) and injects it into a pre-built UI chassis.
5. **Distribution:** Trust Identities (aged Reddit/HN accounts) distribute the tool to the validation communities.
6. **OSI Reflection:** Weekly reflection evaluates the thesis. At day 90, negative OSI = auto-kill.

All state and policies are persisted in PostgreSQL.

---

## 2. The Displacement Engine

The displacement engine is the most important module in V4. It replaces generalist pain scanning as the organism's primary intelligence source.

### Detection Sensors
* **Type 1: PRICE_SHOCK** — A SaaS tool raises prices. Playwright runs weekly DOM diffs on pricing pages. Layer 2 semantic diffing extracts the percentage jump. Layer 3 confirms chatter on Reddit.
* **Type 2: ACQUISITION_KILL** — Detected via Deep Research on TechCrunch / HN spikes.
* **Type 3: FEATURE_REMOVAL** — Changelog diffing.

---

## 3. The New Objective Function (Viability)

V3 used additive scoring (Pain + WTP - Competition). High pain could compensate for lack of buyer money. V4 uses a **Multiplicative** score.

`Viability = SpendProof × DisplacementStrength × Reachability × BuildSpeed × DistributionFit × WindowUrgency`

If any term, especially `SpendProof`, is 0, the entire score is 0.

---

## 4. The Free Tool Flywheel & Chassis

V4 does not build entire complex SaaS platforms immediately.
It uses **Tool Archetypes** (`kernel/toolArchetypes/`):
- VALIDATOR
- COST_ESTIMATOR
- MIGRATION_COMPARATOR
- RISK_SCANNER
- DIFF_ANALYZER

When deployed, these inject configuration JSON into a Next.js `organism-ui-chassis` repository, creating a fully functioning micro-app in seconds to capture high-intent emails.

---

## 5. Trust Identity System

You cannot automate distribution with brand-new bot accounts. 
The Trust Identity System (`state/migrations/021_trust_identities.sql` & `scripts/trust-warmup.ts`) manages aged, "warmed-up" accounts with accumulated karma that deploy the escape hatches into communities natively.

---

## 6. The 90-Day Kill Clock

The organism runs a versioned, falsifiable thesis (e.g., "SMB Pro Services Price Shocks"). 
The `evaluateThesis()` loop evaluates the performance daily. If at day 90 the OSI (Revenue - API Costs) is negative, the thesis is paused, and the system requests a pivot.
