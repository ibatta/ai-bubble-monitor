import axios from 'axios';

const BASE_URL = 'https://www.alphavantage.co/query';
const API_KEY = process.env.ALPHA_VANTAGE_KEY;

// Rate limiting: Alpha Vantage free tier = 25 requests/day
// Cache results in memory to avoid re-fetching within the same process run
const memCache: Map<string, { data: unknown; fetchedAt: number }> = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function cacheGet<T>(key: string): T | null {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    memCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function cacheSet(key: string, data: unknown): void {
  memCache.set(key, { data, fetchedAt: Date.now() });
}

async function fetchYahooPrices(symbol: string): Promise<{ date: string; close: number }[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=6mo&interval=1d`;
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 10_000,
  });

  const result = response.data?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo Finance returned no data for ${symbol}`);

  const timestamps: number[] = result.timestamp || [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

  const prices: { date: string; close: number }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null && !isNaN(closes[i]!)) {
      const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      prices.push({ date: dateStr, close: closes[i]! });
    }
  }

  if (!prices.length) throw new Error(`Yahoo Finance returned empty prices for ${symbol}`);
  return prices.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Fetches daily close prices for a symbol.
 * Primary: Yahoo Finance public chart API (free, reliable, no daily request limits).
 * Fallback: Alpha Vantage API.
 */
export async function getDailyPrices(
  symbol: string,
  outputsize: 'compact' | 'full' = 'compact'
): Promise<{ date: string; close: number }[]> {
  const cacheKey = `daily_${symbol}_${outputsize}`;
  const cached = cacheGet<{ date: string; close: number }[]>(cacheKey);
  if (cached) return cached;

  try {
    const yahooPrices = await fetchYahooPrices(symbol);
    cacheSet(cacheKey, yahooPrices);
    return yahooPrices;
  } catch (yahooErr: any) {
    console.warn(`[Prices] Yahoo Finance failed for ${symbol} (${yahooErr.message}), trying Alpha Vantage...`);
  }

  if (!API_KEY) {
    throw new Error(`Failed to fetch ${symbol} from Yahoo Finance and ALPHA_VANTAGE_KEY is not set`);
  }

  const response = await axios.get(BASE_URL, {
    params: {
      function: 'TIME_SERIES_DAILY',
      symbol,
      outputsize,
      apikey: API_KEY,
    },
    timeout: 15_000,
  });

  const timeSeries = response.data['Time Series (Daily)'];
  if (!timeSeries) {
    const note = response.data['Note'] || response.data['Information'];
    throw new Error(`Alpha Vantage error for ${symbol}: ${note || 'No time series data'}`);
  }

  const prices = Object.entries(timeSeries)
    .map(([date, vals]: [string, unknown]) => ({
      date,
      close: parseFloat((vals as Record<string, string>)['4. close']),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  cacheSet(cacheKey, prices);
  return prices;
}

/**
 * Gets the latest closing price for a symbol.
 */
export async function getLatestClose(symbol: string): Promise<{ close: number; date: string }> {
  const prices = await getDailyPrices(symbol);
  if (!prices.length) throw new Error(`No price data for ${symbol}`);
  return { close: prices[0].close, date: prices[0].date };
}

/**
 * Gets the maximum single-day drop (%) over the trailing N days.
 * Returns positive number = percentage drop. E.g. 8.5 means 8.5% down.
 */
export async function getMaxSingleDayDrop(symbol: string, days = 5): Promise<number> {
  const prices = await getDailyPrices(symbol, 'compact');
  const recent = prices.slice(0, days + 1);

  let maxDrop = 0;
  for (let i = 0; i < recent.length - 1; i++) {
    const drop = ((recent[i + 1].close - recent[i].close) / recent[i + 1].close) * 100;
    // Drop is negative if price fell; we want the magnitude
    const dayDrop = -(drop); // positive if fell
    if (dayDrop > maxDrop) maxDrop = dayDrop;
  }
  return maxDrop;
}

/**
 * Gets the RSP/SPY ratio and its 90-day trend.
 * Returns: ratio, and whether the trend is up/flat/down.
 */
export async function getRspSpyRatio(): Promise<{
  ratio: number;
  date: string;
  trend: 'up' | 'flat' | 'down';
}> {
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
  const rspPrices = await getDailyPrices('RSP', 'compact');
  await delay(1500); // Respect 1 request/sec limit
  const spyPrices = await getDailyPrices('SPY', 'compact');

  const latestDate = rspPrices[0].date;
  const rspLatest = rspPrices[0].close;
  const spyLatest = spyPrices.find(p => p.date === latestDate)?.close ?? spyPrices[0].close;

  const ratio = rspLatest / spyLatest;

  // 90-day trend: compare current ratio to 90-day-ago ratio
  const past90 = rspPrices.find((_, i) => i >= 60); // ~90 trading days ≈ 60 calendar entries in compact
  const spy90 = past90 ? spyPrices.find(p => p.date === past90.date) : null;
  
  let trend: 'up' | 'flat' | 'down' = 'flat';
  if (past90 && spy90) {
    const pastRatio = past90.close / spy90.close;
    const pctChange = (ratio - pastRatio) / pastRatio;
    if (pctChange > 0.01) trend = 'up';
    else if (pctChange < -0.01) trend = 'down';
  }

  return { ratio, date: latestDate, trend };
}

/**
 * Gets VIX level (using VIXM ETF or ^VIX proxy via Alpha Vantage).
 */
export async function getVIX(): Promise<{ value: number; date: string }> {
  // Alpha Vantage free tier doesn't serve ^VIX directly; use VIXY ETF as proxy
  try {
    const prices = await getDailyPrices('VIXY', 'compact');
    return { value: prices[0].close, date: prices[0].date };
  } catch {
    // Fallback: return a neutral value if VIX data unavailable
    console.warn('[Prices] VIX proxy unavailable');
    return { value: 20, date: new Date().toISOString().split('T')[0] };
  }
}

/**
 * Gets the trailing 12-month high for a symbol.
 * Used for gold fear gauge (C2).
 */
export async function get12MonthHigh(symbol: string): Promise<number> {
  const prices = await getDailyPrices(symbol, 'full');
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const recent = prices.filter(p => new Date(p.date) >= yearAgo);
  return Math.max(...recent.map(p => p.close));
}
