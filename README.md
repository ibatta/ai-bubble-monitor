# AI Bubble Pressure Monitor

A self-hosted Node.js + React dashboard that continuously tracks **warning lights** and **all-clear lights** for the AI investment boom, scoring each into a single **Bubble Pressure Index (0–100)**.

> ⚠️ **Educational tool only — not investment advice.** This is a heuristic monitor for discussion purposes. It cannot predict crashes or their timing.

---

## Quick Start (Local)

### 1. Prerequisites
- Node.js 20 LTS or later
- A free FRED API key: [https://fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html)
- A free Alpha Vantage key: [https://www.alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key)
- A PostgreSQL database (local: `createdb ai_bubble`, or use Render)

### 2. Clone and configure
```bash
git clone <repo>
cd "AI bubble"
cp .env.example .env
# Edit .env with your keys
```

### 3. Install dependencies
```bash
npm install
```

### 4. Run in development
```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api

---

## Environment Variables

See `.env.example` for all required variables:

| Variable | Source | Required |
|---|---|---|
| `DATABASE_URL` | Your PostgreSQL connection string | ✅ |
| `FRED_API_KEY` | [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html) — free | ✅ W4, C2 |
| `ALPHA_VANTAGE_KEY` | [alphavantage.co](https://www.alphavantage.co/support/#api-key) — free (25 req/day) | ✅ W3, W5 |
| `ADMIN_TOKEN` | Any secret string you choose | ✅ |
| `NEWS_API_KEY` | [newsapi.org](https://newsapi.org) — optional | Optional |
| `SMTP_HOST/USER/PASS` | Gmail App Password recommended | Optional (alerts) |
| `ALERT_TO` | Email to receive red alerts | Optional |

---

## Indicators

### ⚠️ Warning Lights

| ID | Signal | Source | Cadence |
|---|---|---|---|
| W1 | Hyperscaler Capex Momentum | SEC EDGAR | Quarterly |
| W2 | Capex-to-Payoff Gap | SEC EDGAR | Quarterly |
| W3 | Competitive Shock Monitor | Alpha Vantage (NVDA) | Daily |
| W4 | Macro Pressure (Rates & Oil) | FRED | Daily |
| W5 | Market Breadth (RSP/SPY) | Alpha Vantage | Daily |

### ✅ All-Clear Lights

| ID | Signal | Source | Cadence |
|---|---|---|---|
| G1 | Enterprise AI Adoption | US Census BTOS + Manual | Biweekly |
| G2 | Monetization & Profit Conversion | SEC EDGAR | Quarterly |
| G3 | Customer Concentration | Manual (analyst estimates) | Quarterly |
| G4 | AI Price/Performance & Margin Health | Manual | Monthly |

### 🔍 Context Indicators (Display only — not in composite)

| ID | Signal | Source |
|---|---|---|
| C1 | Valuation Stretch (Shiller CAPE) | Manual (monthly update) |
| C2 | Gold Fear Gauge | FRED gold price series |
| C3 | Circular-Financing Watch | Admin ledger |

---

## Manual Entry (for semi/manual indicators)

For indicators that can't be fully automated (G1, G3, G4, C1, C3), click the card in the dashboard to open the manual entry form. You'll need your `ADMIN_TOKEN`.

Example — G3 Customer Concentration:
```bash
curl -X POST http://localhost:3001/api/manual/G3 \
  -H "Authorization: Bearer your_admin_token" \
  -H "Content-Type: application/json" \
  -d '{"payload": {"top4SharePct": 62.5, "sourceName": "Analyst Q1 2025"}, "note": "Quarterly update"}'
```

Example — C1 CAPE:
```bash
curl -X POST http://localhost:3001/api/manual/C1 \
  -H "Authorization: Bearer your_admin_token" \
  -H "Content-Type: application/json" \
  -d '{"payload": {"cape": 36.2}, "note": "June 2025 multpl.com"}'
```

---

## API Reference

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/index` | GET | — | Composite score + all indicators |
| `/api/indicators` | GET | — | All indicators (current state) |
| `/api/indicators/:id` | GET | — | One indicator + history |
| `/api/history?id=&from=&to=` | GET | — | Time series for charting |
| `/api/manual/:id` | POST | Bearer | Submit manual entry |
| `/api/refresh` | POST | Bearer | Force-refresh all adapters |
| `/api/health` | GET | — | Adapter freshness status |
| `/api/jobs` | GET | — | Recent job run log |

---

## Deploy to Render.com

1. Push to GitHub
2. In Render dashboard: **New → Blueprint** → connect your repo
3. Render reads `render.yaml` and creates both the web service and the Postgres database
4. Add your environment variables in the Render dashboard (Environment tab)
5. Deploy 🚀

---

## Running Tests

```bash
cd server
npm test
```

Tests cover:
- `mapToSubScore` (higher_is_risk and lower_is_risk)
- `computeComposite` (all-green, all-red, mixed, stale-excluded, context-excluded)
- `determineFreshness` (live/stale boundary)
- `subScoreToState` and `computeTrend`

---

## Honesty Caveats

- This is a **heuristic, not a forecast**. No composite score predicts a crash.
- **Capex ≠ pure AI spending**. It includes all infrastructure.
- **"AI revenue"** has no clean line item in any filing. Cloud + Nvidia data-center is an approximation.
- **Top-4 customer share** relies on analyst estimates, not disclosed data.
- **Thresholds are opinions encoded as numbers** — starting points to be tuned.
- The RSP/SPY breadth proxy is minimum-viable. Full constituent breadth requires a paid data tier.

---

## Project Structure

```
/server
  /src
    /adapters      fred.ts edgar.ts prices.ts census.ts news.ts
    /indicators    W1..G4, C1..C3
    /engine        scoring.ts composite.ts freshness.ts
    /jobs          scheduler.ts alerter.ts
    /db            schema.sql repository.ts migrate.ts
    /api           routes.ts
    /config        indicators.ts
    server.ts
  /test            scoring.test.ts
/web
  /src
    /components    BubbleGauge.tsx IndicatorCard.tsx HistoryChart.tsx ...
    App.tsx main.tsx api.ts types.ts
    /styles        theme.css
.env.example
render.yaml
```
