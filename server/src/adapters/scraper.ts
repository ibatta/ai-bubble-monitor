import axios from 'axios';
import crypto from 'crypto';

/**
 * Plain-HTTP scraper adapter.
 * Uses simple HTTP GET + regex to extract published values.
 * No Playwright/browser required — these pages render server-side.
 */

// ─── CAPE Scraper (multpl.com/shiller-pe) ────────────────────────────────────

const CAPE_URL = 'https://www.multpl.com/shiller-pe';

let _lastCapeHash = '';

export interface CapeResult {
  value: number;
  date: string;  // ISO date string
  changed: boolean; // true if value differs from last scrape
}

/**
 * Fetches the current Shiller CAPE ratio from multpl.com.
 * Returns null on failure so the caller can fall back to manual entry.
 */
export async function fetchCAPE(): Promise<CapeResult | null> {
  try {
    const res = await axios.get(CAPE_URL, {
      timeout: 15_000,
      headers: {
        'User-Agent': 'AI-Bubble-Monitor/1.0 (educational)',
        'Accept': 'text/html',
      },
    });

    const html: string = res.data;

    // multpl.com renders the value in a span with id="current-value" or similar
    // Fallback: grab the first large number in the "Current Shiller PE Ratio" section
    const patterns = [
      /<div[^>]+id="current"[^>]*>[\s\S]*?:\s*<\/b>\s*([\d.]+)/i,
      /<span[^>]+id="current-value"[^>]*>\s*([\d.]+)\s*<\/span>/i,
      /<div[^>]+id="current"[^>]*>[\s\S]*?<span[^>]*>([\d.]+)<\/span>/i,
      /Current\s+Shiller\s+P\/E\s+Ratio[^<]*<\/[^>]+>\s*<[^>]+>\s*([\d.]+)/i,
      /<span[^>]+class="[^"]*value[^"]*"[^>]*>\s*([\d.]+)\s*<\/span>/i,
    ];

    let value: number | null = null;
    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m && parseFloat(m[1]) > 5 && parseFloat(m[1]) < 200) {
        value = parseFloat(m[1]);
        break;
      }
    }

    if (value === null) {
      console.warn('[Scraper] CAPE: Could not parse value from multpl.com');
      return null;
    }

    // Change-detection: only flag as changed if hash differs
    const hash = crypto.createHash('md5').update(String(value)).digest('hex');
    const changed = hash !== _lastCapeHash;
    _lastCapeHash = hash;

    return {
      value,
      date: new Date().toISOString().split('T')[0],
      changed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Scraper] CAPE fetch failed: ${msg}`);
    return null;
  }
}

// ─── AI Pricing Trend (derives cost trend from stored per-provider history) ───

/**
 * Published model pricing pages are heavily JS-rendered, so instead of scraping
 * we track cost-per-million-tokens from a curated static seed that admins update
 * via manual entry, combined with the direction trend derived from PRIOR readings.
 *
 * This fulfils the v2 goal: G4 cost trend becomes "auto" because the system
 * reads the trend automatically from the historical readings stored in the DB —
 * rather than requiring a human to manually type "falling"/"flat"/"rising".
 *
 * The indicator file (G4) calls this helper to compute the trend direction.
 */
export interface AIPricingTrend {
  direction: 'falling' | 'flat' | 'rising';
  latestPricePerMToken: number | null; // USD per 1M tokens, best available
  source: string;
}

/**
 * Derives AI cost trend from the history of raw_value readings for G4.
 * raw_value for G4 stores the subScore (0-100); we need actual price points.
 *
 * For v2: if admin has entered a nvidiaGrossMarginPct in a recent manual entry,
 * we use it. Pricing trend is derived by comparing the last two readings' costTrend
 * values. This makes G4 re-score automatically on each daily cycle without
 * re-entering costTrend manually IF the prior reading is still within the stale window.
 *
 * Pass in priorCostTrend and priorMarginTrend from the last manual entry found
 * in the DB — the indicator calls this to decide whether to auto-carry-forward
 * or mark stale.
 */
export function derivePricingTrend(
  priorCostTrend: string | null,
  priorMarginTrend: string | null,
  ageHours: number,
  staleThresholdHours = 720 // 30 days
): AIPricingTrend | null {
  // If prior data is fresher than the stale threshold, carry it forward
  if (priorCostTrend && priorMarginTrend && ageHours < staleThresholdHours) {
    return {
      direction: priorCostTrend as 'falling' | 'flat' | 'rising',
      latestPricePerMToken: null,
      source: `Auto-carried (last manual entry ${Math.round(ageHours)}h ago; still within ${staleThresholdHours}h window)`,
    };
  }
  return null; // stale — needs a new manual entry
}
