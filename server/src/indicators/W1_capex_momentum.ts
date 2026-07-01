import { getTTMCapex, getPriorYearCapex } from '../adapters/edgar';
import { HYPERSCALER_TICKERS } from '../config/indicators';
import { mapToSubScore, subScoreToState, computeTrend, clampScore } from '../engine/scoring';
import { determineFreshness } from '../engine/freshness';
import { upsertReading, getLatestReading, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'W1';

/**
 * W1 — Hyperscaler Capex Momentum
 *
 * Fetches TTM capex for each hyperscaler from EDGAR, computes aggregate YoY %
 * change, maps to a sub-score.
 */
export async function runW1(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    let currentTotal = 0;
    let priorTotal = 0;
    let dataPoints = 0;
    let latestDate = new Date(0);

    for (const ticker of HYPERSCALER_TICKERS) {
      const [current, prior] = await Promise.all([
        getTTMCapex(ticker),
        getPriorYearCapex(ticker),
      ]);

      if (current && prior) {
        currentTotal += current.value;
        priorTotal += prior;
        dataPoints++;
        if (current.asOf > latestDate) latestDate = current.asOf;
      }
    }

    if (dataPoints === 0) {
      throw new Error('No capex data retrieved from EDGAR');
    }

    if (priorTotal === 0) {
      throw new Error('Prior year capex is zero — cannot compute YoY');
    }

    const yoyGrowthPct = ((currentTotal - priorTotal) / priorTotal) * 100;
    const subScore = clampScore(mapToSubScore(config, yoyGrowthPct));
    const state = subScoreToState(subScore);
    const freshness = determineFreshness(latestDate, config.cadenceHours);

    // Compare with prior reading for trend
    const prior = await getLatestReading(ID);
    const trend = computeTrend(subScore, prior?.sub_score ?? null);

    await upsertReading({
      indicator_id: ID,
      raw_value: Math.round(yoyGrowthPct * 100) / 100,
      sub_score: subScore,
      state,
      trend,
      as_of: latestDate,
      source: `SEC EDGAR XBRL (${dataPoints}/${HYPERSCALER_TICKERS.length} hyperscalers)`,
    });

    await logJobRun('edgar:W1', 'success', `YoY capex: ${yoyGrowthPct.toFixed(1)}%`, [ID]);
    console.log(`[W1] Capex YoY: ${yoyGrowthPct.toFixed(1)}% → subScore ${subScore} (${state})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logJobRun('edgar:W1', 'error', msg, []);
    console.error(`[W1] Failed:`, msg);
  }
}
