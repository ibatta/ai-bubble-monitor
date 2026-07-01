# AI Bubble Pressure Monitor — Technical Requirements

**Purpose:** A self-hosted Node.js web dashboard that continuously tracks the "warning lights" and "all-clear lights" for the AI investment boom, scores each one, and rolls them into a single **Bubble Pressure Index (0–100)**. It is a *heuristic monitoring tool for education and discussion — not investment advice and not a market predictor.*

**Audience for this doc:** Claude Code (the build agent). Everything needed to scaffold and implement is below. Where an external API's exact endpoint, field name, or free-tier limit matters, **verify it at build time** — these change, and this spec deliberately specifies *what* to fetch and *how to interpret it* rather than hard-coding volatile endpoint details.

---

## 1. Core concept: the signal model

Each tracked phenomenon becomes an **Indicator**. Every indicator produces:

| Field | Meaning |
|---|---|
| `rawValue` | The latest measured number (e.g. 41.0 for "% of market in top 10") |
| `subScore` | Normalized 0–100 where **100 = maximum bubble/top risk**, **0 = healthy** |
| `state` | `green` (0–33) · `amber` (34–66) · `red` (67–100) |
| `trend` | `up` / `flat` / `down` vs the prior reading |
| `weight` | Importance in the composite (configurable) |
| `tier` | `auto` / `semi` / `manual` — how the value is sourced |
| `freshness` | `live` / `stale` (past its expected refresh window) |
| `asOf` | Timestamp of the underlying data |
| `source` | Human-readable provenance string |

**Composite Bubble Pressure Index:**
```
Index = Σ(subScore_i × weight_i) / Σ(weight_i)
```
Bands: **0–33 Healthy (green) · 34–66 Caution (amber) · 67–100 Elevated risk (red)**.

A signal in a "stale" state is excluded from the weighted average and flagged in the UI (never silently treated as fresh).

> **Direction convention (important):** Some inputs mean "bubble" when they go *up* (concentration, valuation), others when they go *down* (capex growth, breadth, adoption). Each indicator's mapping spec below defines the direction explicitly. Do not assume "higher rawValue = higher risk."

---

## 2. Indicator catalog — how to measure each light

The user's nine lights map to the indicators below. Each spec gives the plain-language light, the precise metric, the formula, the data source, the cadence, and the green→red thresholds. Thresholds are **starting points** and must live in config so they can be tuned.

### W1 — Hyperscaler Capex Momentum
*Light: "Big companies suddenly cut their AI spending."*

- **Measure:** Year-over-year growth of aggregate **trailing-twelve-month (TTM) capital expenditure** across Microsoft, Alphabet, Amazon, Meta, Oracle (configurable list).
- **Formula:** `capexYoY = (TTM_capex_now − TTM_capex_yearAgo) / TTM_capex_yearAgo`. Capex = "Purchases of property and equipment" from the cash-flow statement.
- **Source:** SEC EDGAR XBRL company-facts API (`PaymentsToAcquirePropertyPlantAndEquipment` or company-specific tag) — free. Fallback: a financial-data API (FMP / Finnhub / Alpha Vantage).
- **Cadence:** Quarterly (re-pull during each earnings season; cache between).
- **Mapping (risk rises as growth falls):**
  - `green (0–33)`: YoY ≥ +20%
  - `amber (34–66)`: 0% to +20%
  - `red (67–100)`: YoY < 0% (an actual cut — the classic warning)
- **Tier:** `auto`.
- **Caveat:** Capex is "AI + everything else"; it's a strong proxy, not a pure-AI number. Track the *direction*, not the absolute.

### W2 — Capex-to-Payoff Gap
*Light: "AI stays stuck in testing and never earns real money."*

- **Measure:** The gap between how fast the giants are *spending* and how fast their AI-exposed revenue is *growing*.
- **Formula:**
  - `capexIntensity = TTM_capex / TTM_revenue` (aggregate across the hyperscaler set). Historical SaaS-era norm ≈ 11–16%; recent ≈ 45–57%.
  - `monetizationGrowth` = blended YoY growth of cloud segment revenue (Azure, Google Cloud, AWS) + Nvidia data-center revenue.
  - `payoffGap = capexIntensity_normalized − monetizationGrowth_normalized`.
- **Source:** EDGAR / financial API for segment revenue; Nvidia 10-Q for data-center revenue.
- **Cadence:** Quarterly.
- **Mapping (risk rises as the gap widens — spending outrunning revenue):**
  - `green`: monetization growth keeping pace or ahead of intensity rise
  - `amber`: intensity rising, revenue growth steady
  - `red`: intensity at record highs **and** monetization growth decelerating
- **Tier:** `semi` (segment-revenue tagging is inconsistent across filers; allow a manual override field).
- **Caveat:** There is no clean public "AI revenue" line item. This is an approximation by design — document the proxy in the UI tooltip.

### W3 — Competitive Shock Monitor
*Light: "Another surprise like DeepSeek — a cheaper rival that spooks everyone."*

This is **event-driven**, not a slow gauge. Two layers:

- **Layer A — automated price trigger:** Largest **single-day drawdown** over the trailing 5 days for NVDA and the semiconductor index (SOXX/SMH as proxy). A one-day drop **> 7%** in semis fires a `red` shock event; **> 4%** fires `amber`. Reference event: the Jan 2025 DeepSeek shock erased ~$600B of Nvidia's value in one day.
- **Layer B — early-warning sentiment (optional):** Pull headlines from a news API filtered on keywords (`efficient model`, `training cost`, `open-source frontier`, `cheaper inference`, named challengers). Optionally classify relevance with an LLM call. This raises a soft flag *before* the price move.
- **Source:** Price API (NVDA, SOXX, ^VIX); optional news API.
- **Cadence:** Daily (price); hourly optional for news.
- **Mapping:** Driven by the trigger above; decays back to green over N days (config) absent follow-through.
- **Tier:** `auto` (Layer A); `semi` (Layer B).

### W4 — Macro Pressure (Rates & Energy)
*Light: "Interest rates rise because of expensive oil or war."*

- **Measure:** Composite of (a) 10-year Treasury yield trend, (b) market-implied rate-hike odds, (c) oil price, (d) inflation expectations.
- **Formula / Sources (all FRED — free, reliable):**
  - 10-yr yield: `DGS10` — 60-day change.
  - Brent / WTI: `DCOILBRENTEU` / `DCOILWTICO` — 60-day % change.
  - 5y5y forward inflation expectation: `T5YIFR`.
  - Fed-funds path / hike odds: derive from 30-day Fed Funds futures, or ingest a published "rate-cut/hike probability" feed (CME FedWatch–style). If no clean source, treat `DGS2` (2-yr yield) rising as a hike-expectation proxy.
- **Cadence:** Daily.
- **Mapping (risk rises with rates/oil rising together):**
  - `green`: yields stable/falling, oil stable, hike odds low
  - `amber`: yields creeping up **or** oil spiking
  - `red`: yields rising **and** oil spiking **and** market pricing rate **hikes** (the regime that historically pricks asset bubbles)
- **Tier:** `auto`.

### W5 — Market Breadth
*Light: "Only a tiny handful of stocks keep hitting new highs."*

- **Measure:** How broad the rally is. Narrow = fragile.
- **Metrics (use as many as data allows):**
  - **% of S&P 500 members above their 200-day moving average.**
  - Count of new 52-week highs vs lows.
  - **Equal-weight vs cap-weight ratio:** `RSP / SPY` price ratio, 90-day trend. (Easiest, free — falling ratio = narrowing leadership.)
- **Formula:** Primary breadth score blends `%above200DMA` and the `RSP/SPY` trend.
- **Source:** Per-constituent OHLC (paid tier of FMP/Polygon, or a breadth data feed) for the % metric; **RSP/SPY ratio works with any free price API** as the minimum-viable version.
- **Cadence:** Daily.
- **Mapping (risk rises as breadth narrows):**
  - `green`: > 60% of stocks above 200DMA; RSP/SPY stable or rising
  - `amber`: 40–60%
  - `red`: < 40% above 200DMA **while index is within 3% of its high** (the "narrow new highs" tell seen before the 2000 top)
- **Tier:** `auto` (RSP/SPY proxy) → upgrade to `semi`/`auto` with constituent data.

### G1 — Enterprise AI Adoption & ROI
*Light: "Hospitals, factories and everyday companies start using AI and saving real money."*

- **Measure:** Real-economy diffusion beyond Big Tech.
- **Metrics / Sources:**
  - **US Census Bureau Business Trends and Outlook Survey (BTOS)** — has a recurring "AI use by businesses" question, biweekly, free, sector-breakable. Primary signal: % of firms using AI, and the rate of change.
  - Stanford HAI AI Index (annual) and reputable consulting surveys (McKinsey/Bain) for production-deployment % and reported ROI — entered manually.
  - Optional: enterprise software-spend indices (e.g. Ramp-style) if accessible.
- **Cadence:** BTOS biweekly; survey inputs quarterly/annual (manual).
- **Mapping (risk *falls* as adoption rises — this is an all-clear light):**
  - `green`: adoption rising and production-deployment % climbing
  - `amber`: adoption flat
  - `red`: adoption stalling below ~15% production deployment ("pilot purgatory")
- **Tier:** `semi` (BTOS auto) + `manual` (survey ROI).
- **Caveat:** Lagging and survey-based. Show the survey date prominently.

### G2 — Monetization & Profit Conversion
*Light: "The huge spending keeps turning into real, growing profits."*

- **Measure:** Are the spenders actually converting capex into cash and profit?
- **Metrics:** Aggregate hyperscaler **free cash flow** trend; cloud-segment **operating margin** trend; Nvidia **data-center revenue** YoY; `capex / operating-cash-flow` ratio (a ratio > 1 sustained = burning more than they generate).
- **Source:** EDGAR / financial API.
- **Cadence:** Quarterly.
- **Mapping (risk falls as profit conversion stays healthy):**
  - `green`: FCF positive and growing, margins stable/up
  - `amber`: FCF compressing but positive
  - `red`: sustained negative FCF with margins falling
- **Tier:** `auto`/`semi`.

### G3 — Customer Concentration / Demand Breadth
*Light: "Demand spreads beyond just a few giant customers."*

- **Measure:** How dependent the AI-chip demand is on a handful of buyers.
- **Metric:** Estimated **% of Nvidia revenue from its top customers** (top-1, and analyst-estimated top-4). Nvidia's 10-K/10-Q disclose how many "direct customers" individually exceed 10% of revenue — use that as the auditable anchor; layer analyst top-4 estimates as a manual field.
- **Source:** Nvidia filings (auto for the disclosed >10% customer count); analyst reports (manual for the top-4 %).
- **Cadence:** Quarterly.
- **Mapping (risk rises as concentration rises):**
  - `green`: top-4 share trending down / new buyer segments emerging
  - `amber`: stable around current ~60%
  - `red`: top-4 share rising toward **> 70%** (the loop tightening, not broadening)
- **Tier:** `semi` + `manual`.

### G4 — AI Price/Performance & Margin Health
*Light: "New rivals make AI cheaper without crashing the leaders."*

- **Measure:** Two things at once — is AI getting cheaper for buyers (good for diffusion), and are the leaders' margins surviving the competition (good for stability)?
- **Metrics:**
  - **Cost trend** of frontier model output (price per million tokens) across major providers; or a published price/performance index (e.g. Artificial Analysis–style). Falling cost-per-capability = healthy diffusion.
  - **Gross-margin trend** of Nvidia and key suppliers (a price war that craters margins is the danger flavor).
- **Source:** Published API price lists (scrape or manual table); filings for margins.
- **Cadence:** Monthly (pricing) / quarterly (margins).
- **Mapping:**
  - `green`: cost-per-capability falling **and** leader margins holding
  - `amber`: prices flat, margins flat
  - `red`: aggressive price war collapsing margins (destabilizing) **or** no cost decline at all (no diffusion)
- **Tier:** `manual`/`semi`.

### Context indicators (displayed, not lights)
Shown for situational awareness; can be given low or zero weight in the composite.

- **C1 — Valuation Stretch:** Shiller CAPE (source: multpl.com / Shiller dataset, monthly) + top-10 weight as % of S&P 500 (computed from constituent market caps or a published figure) + Mag-7 forward P/E. Risk rises with valuation. `auto`/`semi`.
- **C2 — Gold Fear Gauge:** Spot gold price and its distance from its trailing 12-month high (source: price API / FRED `IR14260` or a metals feed). Context for the "nervous world" backdrop. `auto`.
- **C3 — Circular-Financing Watch:** A curated, manually-maintained ledger of vendor-financing / cross-investment deals (e.g. chipmaker→model-lab→cloud loops) and big private AI funding rounds. No clean API — this is an **admin-editable table** with date, parties, amount, and a note. `manual`.

---

## 3. Architecture & tech stack

- **Runtime:** Node.js (LTS), TypeScript preferred.
- **Backend:** Express (or Fastify). REST API.
- **Scheduler:** `node-cron` for per-indicator refresh cadences.
- **Storage:** SQLite via `better-sqlite3` (zero-ops, file-based) for time-series history; or Postgres if multi-user/hosted is desired. Store every reading so charts can show history and so "trend" is computed from real prior values.
- **Data-source adapters:** One module per source (`fred.ts`, `edgar.ts`, `prices.ts`, `census.ts`, `news.ts`), each exposing a typed `fetch()` returning normalized points. Adapters are swappable and individually testable.
- **Scoring engine:** Pure functions `mapToSubScore(indicatorConfig, rawValue, history)` and `computeComposite(indicators)`. **No I/O in the scoring layer** so it's fully unit-testable.
- **Frontend:** Lightweight SPA — React + Vite with Recharts or Chart.js. Reuse the visual language of the existing explainer (editorial/serif, gold accent) if convenient, but that's secondary to function.
- **Config:** All thresholds, weights, ticker lists, and cadences in a single `config/indicators.ts` (or JSON) — no magic numbers in logic.
- **Secrets:** API keys in `.env`, loaded via `dotenv`, **never committed**. Provide `.env.example`.

### Suggested project layout
```
/src
  /adapters      fred.ts edgar.ts prices.ts census.ts news.ts
  /indicators    one file per indicator (W1..G4, C1..C3) — config + mapping
  /engine        scoring.ts composite.ts freshness.ts
  /jobs          scheduler.ts (node-cron registrations)
  /db            schema.sql, repository.ts
  /api           routes.ts
  /server.ts
/web             (React/Vite frontend)
/config          indicators.ts (thresholds, weights, cadences)
/test            unit tests for scoring + each adapter (mocked)
.env.example
README.md
```

---

## 4. Data sources summary

| Source | Used for | Key needed? | Notes |
|---|---|---|---|
| **FRED** (St. Louis Fed) | W4 rates/oil/inflation, C2 gold | Free key | Most reliable; series IDs in §2. Verify IDs at build. |
| **SEC EDGAR** XBRL company-facts | W1, W2, G2, G3 fundamentals | None | Free; rate-limit politely (set a User-Agent). |
| **Price API** (FMP / Finnhub / Polygon / Alpha Vantage) | W3, W5, C1, C2 | Free tier (rate-limited) | RSP/SPY, NVDA, SOXX, VIX, gold. Constituent breadth needs a paid tier. |
| **US Census BTOS** | G1 adoption | None | Biweekly business AI-use data; free. |
| **News API** (optional) | W3 Layer B | Free tier | Keyword + optional LLM relevance classification. |
| **multpl.com / Shiller dataset** | C1 CAPE | None | Monthly; scrape or static dataset. |
| **Manual ledger** | G3 top-4, G4 pricing, C3 deals | n/a | Admin UI form; each entry timestamped. |

**Verify at build time:** exact endpoint paths, free-tier request limits, and field/tag names for the above — they drift. Build each adapter behind an interface so a source swap is a one-file change.

---

## 5. API design (backend)

```
GET  /api/index            → composite score, band, asOf, contributing indicators
GET  /api/indicators       → all indicators (current state)
GET  /api/indicators/:id   → one indicator + full history series
GET  /api/history?id=&from=&to=  → time series for charting
POST /api/manual/:id       → submit/override a manual indicator value (auth-gated)
POST /api/refresh          → force-refresh one or all adapters (auth-gated)
GET  /api/health           → adapter freshness + last-run status per source
```
- JSON responses include `asOf`, `source`, `tier`, `freshness` on every value.
- `POST` routes require an admin token (simple bearer from `.env`).

---

## 6. Frontend requirements

1. **Top: the Bubble Pressure Index** — a single gauge (0–100) with the color band and a one-line plain-English verdict.
2. **Two columns of lights** — Warning lights (W1–W5) and All-clear lights (G1–G4), each as a card showing: plain-language name, current state color, the rawValue, trend arrow, sub-score, `asOf` date, source, and a tooltip explaining *how it's measured* and its caveat. **Manual/stale cards are visibly badged.**
3. **Context strip** — Valuation, Gold, Circular-financing watch.
4. **History view** — click any indicator → line chart of its history with the threshold bands shaded.
5. **"How to read this" panel** — reuse the plain-language explanations from the explainer so a non-expert understands each light.
6. **Honesty footer** — data tiers, approximations, "educational, not investment advice."

Keep the non-expert framing from the existing explainer: every number has a plain-language "what this means."

---

## 7. Data model (minimum)

```sql
indicators(id TEXT PK, name TEXT, light TEXT, tier TEXT, weight REAL,
           direction TEXT, thresholds_json TEXT, cadence TEXT)
readings(id INTEGER PK, indicator_id TEXT, raw_value REAL, sub_score REAL,
         state TEXT, as_of DATETIME, source TEXT, fetched_at DATETIME)
manual_ledger(id INTEGER PK, indicator_id TEXT, payload_json TEXT,
              entered_by TEXT, entered_at DATETIME)
job_runs(id INTEGER PK, adapter TEXT, status TEXT, message TEXT, ran_at DATETIME)
```

---

## 8. Non-functional requirements

- **Caching & rate limits:** Respect each source's cadence; never re-fetch within the window. Exponential backoff + retry on failures. Per-adapter request budget guard.
- **Graceful degradation:** If a source fails or data is past its refresh window → mark `stale`, keep last good value visible with a badge, and **exclude it from the composite** (don't fabricate freshness).
- **Testing (required):** Unit tests for every `mapToSubScore` and for `computeComposite` (edge cases: all-green, all-red, mixed, stale-excluded). Adapter tests against recorded/mocked responses. Aim for the scoring engine to be 100% covered — it's the core logic.
- **Logging:** Structured logs per job run (`job_runs` table + console). A `/api/health` endpoint surfaces adapter status.
- **Config-driven:** Thresholds/weights/tickers editable without touching logic. Changing a threshold re-scores history on demand.
- **No secrets in code or repo.** `.env.example` documents every required key.
- **Idempotent jobs:** Re-running a fetch for the same period updates, not duplicates.

---

## 9. Suggested build phases (for incremental delivery)

1. **Scaffold + one end-to-end indicator.** Express + SQLite + config + scoring engine + frontend shell. Implement **W4 (Macro via FRED)** fully — it's free, reliable, and exercises the whole pipeline.
2. **Market indicators (price-based):** W5 (RSP/SPY proxy), W3 Layer A (shock trigger), C2 (gold), C1 (CAPE). All from a free price API + FRED.
3. **Fundamental indicators (EDGAR):** W1, W2, G2, G3 anchor. Quarterly cadence + caching.
4. **Research/manual indicators:** G1 (BTOS auto + survey manual), G4 (pricing), C3 (deal ledger). Build the admin input UI here.
5. **Composite, history charts, freshness badges, health page, tests, README.**

Each phase should be independently runnable and demoable.

---

## 10. Out of scope / honesty caveats (state these in the README and UI)

- This is a **heuristic, not a forecast.** No single light, and no composite score, predicts a crash or its timing.
- Several signals are **proxies** (capex isn't pure-AI; "AI revenue" has no clean line item; top-4 customer share relies on analyst estimates). Each proxy must be disclosed in its tooltip.
- Thresholds are **opinions encoded as numbers** — starting points to be tuned, not truths.
- **Not investment advice.**

---

## 11. Open questions for the product owner (decide before/early in the build)

1. **Data budget:** free-tier only (accept the RSP/SPY breadth proxy and manual fields), or is there budget for a paid market-data tier (Polygon/FMP) to get true constituent breadth and cleaner fundamentals?
2. **Hosting/users:** single-user local tool (SQLite is perfect) or multi-user hosted (then Postgres + real auth)?
3. **Frontend:** reuse the editorial/gold look of the explainer, or a denser "ops dashboard" style?
4. **Alerting:** do you want push alerts (email/Slack) when an indicator flips to red, or is the dashboard view enough for v1?
5. **Refresh authority:** who can edit manual indicators and thresholds — just you, or a small team?
