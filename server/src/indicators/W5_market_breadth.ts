import { getRspSpyRatio } from '../adapters/prices';
import { subScoreToState, computeTrend, clampScore } from '../engine/scoring';
import { determineFreshness } from '../engine/freshness';
import { upsertReading, getLatestReading, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'W5';

/**
 * W5 — Market Breadth
 *
 * Uses RSP/SPY ratio as the minimum-viable breadth proxy:
 * - RSP = Invesco S&P 500 Equal-Weight ETF
 * - SPY = SPDR S&P 500 ETF (cap-weighted)
 * - Falling ratio = fewer large stocks driving the market = narrowing breadth = risk
 *
 * Scoring:
 * - RSP/SPY trend: 'up' = broad rally = green (low risk)
 * - RSP/SPY trend: 'flat' = neutral = amber
 * - RSP/SPY trend: 'down' = narrowing breadth = red
 *
 * The raw value is the current RSP/SPY ratio.
 * Score is based on the 90-day trend direction.
 */
export async function runW5(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    const { ratio, date, trend: ratioTrend } = await getRspSpyRatio();

    // Score based on trend direction:
    // up = green (0–33); flat = amber (34–66); down = red (67–100)
    let subScore: number;
    if (ratioTrend === 'up') {
      subScore = 15;  // healthy — broad rally
    } else if (ratioTrend === 'flat') {
      subScore = 50;  // neutral — watch
    } else {
      subScore = 80;  // narrowing breadth — risk
    }

    const state = subScoreToState(subScore);
    const prior = await getLatestReading(ID);
    const trend = computeTrend(subScore, prior?.sub_score ?? null);

    await upsertReading({
      indicator_id: ID,
      raw_value: Math.round(ratio * 10000) / 10000,
      sub_score: subScore,
      state,
      trend,
      as_of: new Date(date),
      source: `RSP/SPY breadth ratio (90-day trend: ${ratioTrend})`,
    });

    await logJobRun('prices:W5', 'success', `RSP/SPY: ${ratio.toFixed(4)}, trend: ${ratioTrend}`, [ID]);
    console.log(`[W5] RSP/SPY: ${ratio.toFixed(4)} (trend: ${ratioTrend}) → subScore ${subScore} (${state})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[W5] Live fetch failed (${msg}) — checking DB for prior reading...`);

    const prior = await getLatestReading(ID);
    if (prior) {
      console.log(`[W5] Carrying forward prior reading (score: ${prior.sub_score})`);
      await logJobRun('prices:W5', 'success', `Carried forward prior DB reading (${msg})`, [ID]);
    } else {
      await logJobRun('prices:W5', 'error', msg, []);
      console.error(`[W5] Failed and no prior DB reading exists:`, msg);
    }
  }
}
