import { IndicatorConfig } from '../types';

/**
 * Master configuration for all indicators.
 * All thresholds, weights, and cadences live here — no magic numbers in logic.
 *
 * THRESHOLDS (for higher_is_risk indicators):
 *   rawValue <= greenMax → green
 *   greenMax < rawValue <= amberMax → amber
 *   rawValue > amberMax → red
 *
 * For lower_is_risk, the mapping is inverted in scoring.ts — see mapToSubScore().
 */
export const INDICATOR_CONFIGS: IndicatorConfig[] = [

  // ───────────────────────────────────────────────────────────────────────────
  // WARNING LIGHTS
  // ───────────────────────────────────────────────────────────────────────────

  {
    id: 'W1',
    name: 'Hyperscaler Capex Momentum',
    light: 'Big companies suddenly cut their AI spending',
    tier: 'auto',
    weight: 2.0,
    direction: 'lower_is_risk',   // risk rises as YoY growth FALLS
    thresholds: {
      greenMax: 100,   // dummy upper bound (used by lower_is_risk logic)
      amberMax: 20,    // >= 20% YoY = green; 0–20% = amber; < 0% = red
    },
    // For lower_is_risk the thresholds are interpreted as:
    // rawValue >= 20 → green; 0 <= rawValue < 20 → amber; rawValue < 0 → red
    cadenceHours: 24 * 90,  // quarterly (90 days)
    category: 'warning',
    unit: '%',
    description: 'Year-over-year growth of trailing-twelve-month capital expenditure across Microsoft, Alphabet, Amazon, Meta, and Oracle. Sources: SEC EDGAR XBRL company-facts API.',
    caveat: 'Capex covers AI and non-AI infrastructure. Track the direction, not the absolute level.',
  },

  {
    id: 'W2',
    name: 'Capex-to-Payoff Gap',
    light: 'AI stays stuck in "testing" and never earns real money for ordinary businesses',
    tier: 'auto',
    weight: 1.5,
    direction: 'higher_is_risk',  // risk rises as gap widens
    thresholds: {
      greenMax: 20,    // gap score 0–20 = green
      amberMax: 50,    // gap score 21–50 = amber; >50 = red
    },
    cadenceHours: 24 * 90,
    category: 'warning',
    unit: 'score',
    description: 'Measures how far hyperscaler capex intensity (capex/revenue) is outpacing AI-linked revenue growth (Azure + Google Cloud + AWS + Nvidia data-center). A rising gap = spending not yet converting to returns.',
    caveat: 'No clean "AI revenue" line item exists — this is an approximation using cloud + Nvidia data-center segments.',
  },

  {
    id: 'W3',
    name: 'Competitive Shock Monitor',
    light: 'Another surprise like DeepSeek — a cheaper rival that spooks everyone',
    tier: 'auto',
    weight: 1.5,
    direction: 'higher_is_risk',
    thresholds: {
      greenMax: 0,    // 0 = no shock
      amberMax: 50,   // amber shock event
    },
    cadenceHours: 24,
    category: 'warning',
    unit: 'score',
    description: 'Triggered by single-day drawdowns in NVDA and the semiconductor sector. A one-day drop >7% in semis fires red; >4% fires amber. Score decays back to green over 14 days if no follow-through.',
    caveat: 'Layer A is price-based (automatic). Layer B (news sentiment) is optional and marked semi-auto.',
  },

  {
    id: 'W4',
    name: 'Macro Pressure',
    light: 'Interest rates rise because of expensive oil or war',
    tier: 'auto',
    weight: 1.5,
    direction: 'higher_is_risk',
    thresholds: {
      greenMax: 30,
      amberMax: 60,
    },
    cadenceHours: 24,
    category: 'warning',
    unit: 'score',
    description: 'Composite of: 10-year Treasury yield 60-day change, Brent oil 60-day % change, and 5y5y forward inflation expectation. All from FRED (St. Louis Federal Reserve) — free and highly reliable.',
    caveat: '2-year yield used as rate-hike expectation proxy when Fed Funds futures are unavailable.',
  },

  {
    id: 'W5',
    name: 'Market Breadth',
    light: 'Only a tiny handful of stocks keep hitting new highs',
    tier: 'auto',
    weight: 1.5,
    direction: 'lower_is_risk',   // risk rises as breadth NARROWS (RSP/SPY falls)
    thresholds: {
      greenMax: 100,
      amberMax: 0,    // RSP/SPY ratio interpreted as: ratio trending up = green
    },
    cadenceHours: 24,
    category: 'warning',
    unit: 'ratio',
    description: 'RSP/SPY price ratio (equal-weight vs cap-weight S&P 500). A falling ratio indicates fewer stocks driving the market — the narrowing leadership seen before the 2000 peak.',
    caveat: 'RSP/SPY is a minimum-viable breadth proxy. True % of S&P 500 above 200DMA requires a paid data tier.',
  },

  // ───────────────────────────────────────────────────────────────────────────
  // ALL-CLEAR LIGHTS
  // ───────────────────────────────────────────────────────────────────────────

  {
    id: 'G1',
    name: 'Enterprise AI Adoption',
    light: 'Hospitals, factories and everyday companies start using AI and saving real money',
    tier: 'auto',
    weight: 2.0,
    direction: 'lower_is_risk',   // higher adoption = lower risk
    thresholds: {
      greenMax: 100,
      amberMax: 25,   // >=25% production deployment = green; 15–25% = amber; <15% = red
    },
    cadenceHours: 24 * 14,   // biweekly (BTOS)
    category: 'allclear',
    unit: '%',
    description: 'Primary: US Census Bureau Business Trends and Outlook Survey (BTOS) — % of businesses using AI (requires CENSUS_API_KEY in .env). Secondary: Stanford HAI AI Index and consulting survey data (manual entry). Rising = healthy.',
    caveat: 'Survey-based and lagging. Always show the survey date. Production-deployment % relies on consulting surveys entered manually.',
  },

  {
    id: 'G2',
    name: 'Monetization & Profit Conversion',
    light: 'The huge spending keeps turning into real, growing profits',
    tier: 'auto',
    weight: 2.0,
    direction: 'lower_is_risk',   // higher FCF/margins = lower risk
    thresholds: {
      greenMax: 100,
      amberMax: 0,
    },
    cadenceHours: 24 * 90,
    category: 'allclear',
    unit: 'score',
    description: 'Aggregate hyperscaler free cash flow trend, cloud-segment operating margin trend, and Nvidia data-center revenue YoY. capex/OCF ratio also monitored. Sources: SEC EDGAR.',
    caveat: 'Segment-level revenue attribution is inconsistent across filers. Manually override if segment labeling changes.',
  },

  {
    id: 'G3',
    name: 'Customer Concentration',
    light: 'Demand spreads beyond just a few giant customers',
    tier: 'auto',
    weight: 1.5,
    direction: 'higher_is_risk',  // higher concentration = higher risk
    thresholds: {
      greenMax: 50,   // top-4 < 50% = green
      amberMax: 65,   // 50–65% = amber; >65% = red (approaching 70% danger zone)
    },
    cadenceHours: 24 * 90,
    category: 'allclear',
    unit: '%',
    description: 'Estimated % of Nvidia revenue from its top customers. EDGAR-disclosed: count of direct customers >10% of revenue. Top-4 % estimated from analyst reports (manual field).',
    caveat: 'Top-4 share is analyst-estimated — not a disclosed figure. Mark as semi-auto and show estimate date.',
  },

  {
    id: 'G4',
    name: 'AI Price/Performance & Margin Health',
    light: 'New rivals make AI cheaper without crashing the leaders',
    tier: 'auto',
    weight: 1.0,
    direction: 'higher_is_risk',
    thresholds: {
      greenMax: 30,
      amberMax: 60,
    },
    cadenceHours: 24 * 30,   // monthly
    category: 'allclear',
    unit: 'score',
    description: 'Two dimensions: (1) cost-per-million-tokens trend across frontier models (falling = healthy diffusion), (2) Nvidia gross margin trend (collapsing = destabilizing price war). Admin enters pricing data manually.',
    caveat: 'Token pricing is manually maintained from published API price lists. Margins from quarterly filings.',
  },

  // ───────────────────────────────────────────────────────────────────────────
  // CONTEXT INDICATORS
  // ───────────────────────────────────────────────────────────────────────────

  {
    id: 'C1',
    name: 'Valuation Stretch',
    light: 'Shiller CAPE & Magnificent 7 forward P/E',
    tier: 'auto',
    weight: 0.5,   // context — low weight in composite
    direction: 'higher_is_risk',
    thresholds: {
      greenMax: 25,   // CAPE ≤ 25 = green
      amberMax: 35,   // 25–35 = amber; > 35 = red
    },
    cadenceHours: 24 * 30,   // monthly
    category: 'context',
    unit: 'CAPE',
    description: 'Shiller CAPE ratio (cyclically adjusted P/E) — a historically reliable long-term valuation signal. Supplemented by Mag-7 forward P/E (manual) and top-10 S&P 500 weight %.',
    caveat: 'CAPE can stay elevated for years. It signals risk, not timing.',
  },

  {
    id: 'C2',
    name: 'Gold Fear Gauge',
    light: 'Spot gold vs trailing 12-month high',
    tier: 'auto',
    weight: 0.5,
    direction: 'higher_is_risk',
    thresholds: {
      greenMax: 5,     // gold within 5% of 12mo high = neutral
      amberMax: 0,     // gold at or above 12mo high = amber/red
    },
    cadenceHours: 24,
    category: 'context',
    unit: '%',
    description: 'Distance of spot gold from its trailing 12-month high, expressed as % above high. Gold surging near/above its high signals macro fear. Source: FRED series GOLDAMGBD228NLBM or Alpha Vantage.',
    caveat: 'Gold can rise for many reasons beyond AI bubble risk (e.g. general inflation, geopolitical tension).',
  },

  {
    id: 'C3',
    name: 'Circular-Financing Watch',
    light: 'Vendor financing / cross-investment deal ledger',
    tier: 'hitl',
    weight: 0,   // display-only, not in composite
    direction: 'higher_is_risk',
    thresholds: {
      greenMax: 0,
      amberMax: 3,
    },
    cadenceHours: 24 * 7,
    category: 'context',
    unit: 'deals',
    description: 'Manually-maintained ledger of chipmaker→model-lab→cloud circular investment deals and large private AI funding rounds. Count of recent deals is the raw value.',
    caveat: 'Purely qualitative — admin-entered. Zero weight in composite.',
  },
];

// Helper: get config by ID
export function getIndicatorConfig(id: string): IndicatorConfig | undefined {
  return INDICATOR_CONFIGS.find(c => c.id === id);
}

// Configurable: tickers for hyperscaler capex calculation
export const HYPERSCALER_TICKERS = ['MSFT', 'GOOGL', 'AMZN', 'META', 'ORCL'];

// Configurable: shock decay days for W3
export const W3_SHOCK_DECAY_DAYS = 14;

// Configurable: amber/red thresholds for W3 single-day drawdown
export const W3_RED_DRAWDOWN_PCT = 7;
export const W3_AMBER_DRAWDOWN_PCT = 4;
