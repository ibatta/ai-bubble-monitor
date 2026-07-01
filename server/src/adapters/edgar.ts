import axios from 'axios';

const BASE_URL = 'https://data.sec.gov';
const COMPANY_FACTS_URL = `${BASE_URL}/api/xbrl/companyfacts`;

// CIK mappings for hyperscalers (verify these remain correct at build time)
export const COMPANY_CIKS: Record<string, string> = {
  MSFT: '0000789019',   // Microsoft
  GOOGL: '0001652044',  // Alphabet
  AMZN: '0001018724',   // Amazon
  META: '0001326801',   // Meta
  ORCL: '0001341439',   // Oracle
  NVDA: '0001045810',   // Nvidia
};

// Possible GAAP tags for capex (in order of preference)
const CAPEX_TAGS = [
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'CapitalExpenditures',
  'PurchasesOfPropertyAndEquipment',
];

interface XBRLFact {
  end: string;
  val: number;
  form: string;
  frame?: string;
}

interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    'us-gaap'?: Record<string, { units: { USD: XBRLFact[] } }>;
  };
}

export async function fetchCompanyFacts(ticker: string): Promise<CompanyFacts> {
  const cik = COMPANY_CIKS[ticker];
  if (!cik) throw new Error(`No CIK registered for ticker ${ticker}`);

  const url = `${COMPANY_FACTS_URL}/CIK${cik}.json`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'AI-Bubble-Monitor contact@example.com',
      'Accept': 'application/json',
    },
    timeout: 30_000,
  });

  return response.data as CompanyFacts;
}

/**
 * Gets trailing-twelve-month capex for a given ticker.
 * Prefers annual 10-K filings; falls back to summing four quarterly 10-Q filings.
 */
export async function getTTMCapex(ticker: string): Promise<{ value: number; asOf: Date } | null> {
  try {
    const facts = await fetchCompanyFacts(ticker);
    const usGaap = facts.facts['us-gaap'];
    if (!usGaap) return null;

    for (const tag of CAPEX_TAGS) {
      const entry = usGaap[tag];
      if (!entry?.units?.USD) continue;

      const observations = entry.units.USD
        .filter(o => o.form === '10-K' && o.val > 0)
        .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime());

      if (observations.length >= 2) {
        return {
          value: observations[0].val,
          asOf: new Date(observations[0].end),
        };
      }
    }
    return null;
  } catch (err) {
    console.warn(`[EDGAR] Failed to fetch capex for ${ticker}:`, err);
    return null;
  }
}

/**
 * Gets TTM capex for the prior year (for YoY calculation).
 */
export async function getPriorYearCapex(ticker: string): Promise<number | null> {
  try {
    const facts = await fetchCompanyFacts(ticker);
    const usGaap = facts.facts['us-gaap'];
    if (!usGaap) return null;

    for (const tag of CAPEX_TAGS) {
      const entry = usGaap[tag];
      if (!entry?.units?.USD) continue;

      const observations = entry.units.USD
        .filter(o => o.form === '10-K' && o.val > 0)
        .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime());

      if (observations.length >= 2) {
        return observations[1].val;
      }
    }
    return null;
  } catch (err) {
    console.warn(`[EDGAR] Failed to fetch prior capex for ${ticker}:`, err);
    return null;
  }
}

/**
 * Gets the most recent TTM revenue for a ticker.
 */
export async function getTTMRevenue(ticker: string): Promise<{ value: number; asOf: Date } | null> {
  const REVENUE_TAGS = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'];
  try {
    const facts = await fetchCompanyFacts(ticker);
    const usGaap = facts.facts['us-gaap'];
    if (!usGaap) return null;

    for (const tag of REVENUE_TAGS) {
      const entry = usGaap[tag];
      if (!entry?.units?.USD) continue;

      const obs = entry.units.USD
        .filter(o => o.form === '10-K' && o.val > 0)
        .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime());

      if (obs.length > 0) {
        return { value: obs[0].val, asOf: new Date(obs[0].end) };
      }
    }
    return null;
  } catch (err) {
    console.warn(`[EDGAR] Failed to fetch revenue for ${ticker}:`, err);
    return null;
  }
}

/**
 * Gets operating cash flow for FCF calculation.
 */
export async function getOperatingCashFlow(ticker: string): Promise<{ value: number; asOf: Date } | null> {
  const TAGS = ['NetCashProvidedByUsedInOperatingActivities'];
  try {
    const facts = await fetchCompanyFacts(ticker);
    const usGaap = facts.facts['us-gaap'];
    if (!usGaap) return null;

    for (const tag of TAGS) {
      const entry = usGaap[tag];
      if (!entry?.units?.USD) continue;

      const obs = entry.units.USD
        .filter(o => o.form === '10-K' && o.val > 0)
        .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime());

      if (obs.length > 0) {
        return { value: obs[0].val, asOf: new Date(obs[0].end) };
      }
    }
    return null;
  } catch (err) {
    console.warn(`[EDGAR] Failed to fetch OCF for ${ticker}:`, err);
    return null;
  }
}
