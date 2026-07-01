import { getTTMCapex, getTTMRevenue } from '../adapters/edgar';
import { HYPERSCALER_TICKERS } from '../config/indicators';
import { mapToSubScore, subScoreToState, computeTrend, clampScore } from '../engine/scoring';
import { determineFreshness } from '../engine/freshness';
import { upsertReading, getLatestReading, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'W2';

// Cloud segment revenue tickers (Nvidia data-center as proxy for AI monetization)
const MONETIZATION_TICKERS = ['MSFT', 'GOOGL', 'AMZN', 'NVDA'];

/**
 * W2 — Capex-to-Payoff Gap
 *
 * capexIntensity = aggregate(TTM_capex / TTM_revenue) for hyperscalers
 * Historical norm ≈ 11–16%; current ~45–57%
 *
 * Gap score = normalize(capexIntensity) against historical range.
 * Higher intensity relative to revenue growth = higher gap score = more risk.
 */
export async function runW2(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    let totalCapex = 0;
    let totalRevenue = 0;
    let dataPoints = 0;
    let latestDate = new Date(0);

    for (const ticker of HYPERSCALER_TICKERS) {
      const [capex, revenue] = await Promise.all([
        getTTMCapex(ticker),
        getTTMRevenue(ticker),
      ]);

      if (capex && revenue) {
        totalCapex += capex.value;
        totalRevenue += revenue.value;
        dataPoints++;
        if (capex.asOf > latestDate) latestDate = capex.asOf;
      }
    }

    if (dataPoints === 0 || totalRevenue === 0) {
      throw new Error('Insufficient EDGAR data for W2');
    }

    const capexIntensityPct = (totalCapex / totalRevenue) * 100;

    // Normalize against historical range:
    // Historical SaaS norm: ~12%; Recent AI-era: ~50%
    // Gap score: 0 = historical norm, 100 = way above historical norm
    const HISTORICAL_NORM = 12;
    const ELEVATED_THRESHOLD = 50;
    const rawGapScore = Math.max(0, (capexIntensityPct - HISTORICAL_NORM) / (ELEVATED_THRESHOLD - HISTORICAL_NORM) * 100);

    const subScore = clampScore(mapToSubScore(config, rawGapScore));
    const state = subScoreToState(subScore);
    const freshness = determineFreshness(latestDate, config.cadenceHours);

    const prior = await getLatestReading(ID);
    const trend = computeTrend(subScore, prior?.sub_score ?? null);

    await upsertReading({
      indicator_id: ID,
      raw_value: Math.round(capexIntensityPct * 10) / 10,
      sub_score: subScore,
      state,
      trend,
      as_of: latestDate,
      source: `SEC EDGAR XBRL (${dataPoints} companies; capex/revenue ratio)`,
    });

    await logJobRun('edgar:W2', 'success', `Capex intensity: ${capexIntensityPct.toFixed(1)}%`, [ID]);
    console.log(`[W2] Capex intensity: ${capexIntensityPct.toFixed(1)}% → subScore ${subScore} (${state})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logJobRun('edgar:W2', 'error', msg, []);
    console.error(`[W2] Failed:`, msg);
  }
}
