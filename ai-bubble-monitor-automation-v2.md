# AI Bubble Pressure Monitor — Automation-First (v2 Delta)

**Read this together with `ai-bubble-monitor-requirements.md` (the base spec).** This document describes **only the changes** that make the dashboard genuinely self-running. Everything in the base spec still applies unless explicitly overridden here. Section references (§) point to sections in the base spec.

---

## 0. Guiding principle for this change

**Automate hard, keep provenance visible.** The goal is that data refreshes on a schedule with almost no human touch — *not* that hand-entered numbers are disguised as live feeds. Every value keeps its `asOf`, `source`, and `tier` fields (base spec §1). Visible provenance is what *proves* the automation is working; hiding it would make the tool less trustworthy, not more automated. Do not remove freshness badges to "look" automated.

---

## 1. New capability: always-on scheduler + hosting

The base spec assumed local runs. v2 requires the app to run unattended on a schedule.

- **Host it always-on.** Target a managed host (e.g. Railway / Render / Fly / a small VPS). Confirm current free-tier limits at build time.
- **Real scheduling.** Keep `node-cron` inside the app for per-indicator cadences (base §2), **and** support a platform-cron / scheduled-GitHub-Action fallback that triggers `POST /api/refresh` for environments that sleep idle processes.
- **UI reflects it.** Header shows "Last updated automatically at `<time>` (`<timezone>`)" and the next scheduled run per adapter.
- **Idempotent + catch-up.** On boot, run any refresh whose cadence window has elapsed since the last recorded `job_runs` entry, so downtime self-heals.

Add a section to the README documenting the deploy + schedule setup.

---

## 2. New adapters (promote "semi/manual" indicators to `auto`)

Build these four adapter types. Each replaces manual entry for the indicators noted.

### 2a. Census BTOS adapter → automates **G1 (Enterprise Adoption)**
- The US Census Business Trends and Outlook Survey publishes business AI-use data on a recurring (biweekly) release. Write an adapter that pulls the latest release and extracts the "% of firms using AI" (overall + by sector) and its change vs. prior release.
- **Result:** G1 tier changes `semi + manual` → **`auto`**. Only the proprietary consulting-survey ROI overlay (McKinsey/Bain) remains an *optional manual overlay*, low weight.

### 2b. Playwright scraping adapter → automates **C1 (CAPE)** and **G4 (AI pricing)**
- Some sources have no API (Shiller CAPE page; provider API price lists). Use a **headless Playwright** adapter to fetch and parse them on a monthly cadence.
- Add **change-detection**: hash the parsed payload and only write a new reading when the value actually changes, to avoid noise and reduce writes.
- Parse targets: CAPE value (C1); published price-per-million-tokens for each major model provider (G4). Store each provider as its own series so the cost-trend line is real.
- **Result:** C1 → **`auto`**; G4 tier `manual/semi` → **`auto`** for pricing (margins still come from filings via 2c).
- Reuse the existing Playwright familiarity; keep selectors in config so a page redesign is a one-line fix, and fail gracefully to `stale` (never crash the pipeline) if a layout breaks.

### 2c. Claude-API filing-extraction adapter → automates **W1, W2, G2, G3**
- Reading a 10-Q/10-K and transcribing the right number is the manual step. Automate it: when EDGAR reports a new filing for a tracked company, fetch the document and send it to the **Claude API** with a strict instruction to return **structured JSON only** for the needed fields:
  - capex (W1), segment/cloud revenue (W2, G2), free cash flow & operating margin (G2), and the customer-concentration disclosure — i.e. how many direct customers each exceed 10% of revenue, plus any stated percentages (G3).
- Validate the JSON against a schema before writing; on parse/validation failure, mark the indicator `stale` and log to `job_runs` for review (do not write garbage).
- Prefer EDGAR XBRL structured tags first (base §2 W1); use the Claude extraction as the adapter for fields that XBRL tags inconsistently (segment revenue, the customer-concentration *language*).
- **Result:** W2 `semi` → **`auto`**; G2 → **`auto`**; G3's auditable filing-disclosed portion → **`auto`**. The analyst-estimated *top-4 customer %* (not in filings) stays an *optional manual overlay*.

### 2d. News + Claude classifier → automates surfacing for **W3 Layer B** and **C3**
- Pull headlines from a news API on a keyword filter, then pass candidates to a **Claude classifier** call that (a) rates relevance and (b) for C3, drafts a structured ledger entry (date, parties, amount, deal type, note).
- **W3 Layer B** becomes **`auto`** (soft early-warning flag before the price trigger).
- **C3** becomes **human-in-the-loop** rather than fully manual — see §3.

---

## 3. Human-in-the-loop flow for C3 (Circular-Financing Watch)

C3 requires judgment, so keep a human in the loop — but automate everything around it (same pattern as the Office-365 assistant: auto-draft, quick confirm).

1. Classifier (2d) detects a likely vendor-financing / cross-investment / mega-round item and **drafts** a `manual_ledger` entry with status `pending`.
2. UI shows a **review queue**; the human approves/edits/rejects with one click.
3. Approved entries are timestamped with both the source article date and the approval time.

Net effect: ~95% automated (detection + drafting), with a fast human confirm that keeps the ledger trustworthy. C3 tier: `manual` → **`hitl` (auto-surfaced, human-approved)**.

---

## 4. Self-monitoring, alerting & live UI (extends §8)

Add to the non-functional requirements:

- **Auto-refresh frontend.** The dashboard polls (or uses websockets/SSE) so it updates without a manual reload; show a subtle "updated just now" pulse.
- **Alerting.** When any indicator flips to `red`, or an adapter goes `stale` past its window, send a push alert (email and/or Slack webhook — configurable in `.env`). Include the indicator, old→new state, and value.
- **Health surfacing.** `/api/health` (base §5) drives a visible status row: per-adapter last run, next run, and freshness. A failing adapter is loud, not silent.
- **Retry/backoff already in §8** — confirm every adapter uses it and records outcomes to `job_runs`.

The felt result of these three: the system runs on its own, watches itself, and only pings you when something needs attention.

---

## 5. Revised tier map (replaces the per-indicator `tier` values in §2)

| Indicator | Base tier | **v2 tier** | How |
|---|---|---|---|
| W1 Capex momentum | auto | **auto** | EDGAR XBRL + Claude extraction fallback (2c) |
| W2 Capex-to-payoff gap | semi | **auto** | Claude filing extraction (2c) |
| W3 Competitive shock | auto / semi | **auto** | price trigger + news classifier (2d) |
| W4 Macro pressure | auto | **auto** | FRED (unchanged) |
| W5 Market breadth | auto (proxy) | **auto (proxy)** | RSP/SPY; true constituent breadth still needs paid data |
| G1 Enterprise adoption | semi + manual | **auto** (+ optional manual ROI overlay) | Census BTOS adapter (2a) |
| G2 Monetization | auto / semi | **auto** | Claude filing extraction (2c) |
| G3 Customer concentration | semi + manual | **auto** (disclosed) + optional manual top-4 overlay | filing extraction (2c) |
| G4 AI price/perf | manual / semi | **auto** (pricing) + margins from filings | Playwright (2b) + 2c |
| C1 Valuation stretch | auto / semi | **auto** | Playwright/CAPE (2b) |
| C2 Gold fear gauge | auto | **auto** | price/FRED (unchanged) |
| C3 Circular-financing | manual | **hitl** | classifier draft + 1-click approve (§3) |

**Residual manual = two optional low-weight overlays only:** the consulting-survey ROI figure (G1) and the analyst top-4 customer estimate (G3). Both are enrichments, not required inputs; the composite is fully computable without them.

---

## 6. Build-phase changes (adjust §9)

Insert after the base Phase 5:

- **Phase 6 — Automation layer:** deploy + scheduler (§1); Census, Playwright, and Claude-extraction adapters (§2a–2c); flip the tier map (§5).
- **Phase 7 — Watchfulness:** news classifier + C3 review queue (§2d, §3); alerting + auto-refresh UI + health row (§4).

Each phase remains independently demoable.

---

## 7. Unchanged from the base spec

Signal model (§1), composite scoring and stale-exclusion (§1), API surface (§5) aside from the additions noted, data model (§7), the honesty caveats (§10), and the open questions (§11) all still stand. In particular, **§11 Q1 (free-only vs. paid data budget) still gates true 500-stock breadth for W5** — automation doesn't remove that constraint.
