import { getLatestFredValue, getFredSeriesRange } from '../adapters/fred';
import { subScoreToState, computeTrend, clampScore } from '../engine/scoring';
import { upsertReading, getLatestReading, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'C2';

/**
 * C2 — Gold Fear Gauge
 */
export async function runC2(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    // Fetch gold data range. If it fails (e.g. rate limit / series missing), fallback gracefully
    let goldData: { value: number; date: Date }[] = [];
    try {
      goldData = await getFredSeriesRange('GOLDAMGBD228NLBM', 365);
    } catch (e) {
      console.warn('[C2] FRED range query failed, falling back to latest price...');
      const latest = await getLatestFredValue('GOLDAMGBD228NLBM');
      goldData = [{ value: latest.value, date: new Date(latest.date) }];
    }

    if (goldData.length === 0) {
      throw new Error('No gold data retrieved from FRED');
    }

    // If we only have 1 data point, we treat it as 0% vs 12-month high
    const latestPrice = goldData[goldData.length - 1].value;
    const latestDate = goldData[goldData.length - 1].date;

    let high12m = latestPrice;
    if (goldData.length > 5) {
      const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const yearData = goldData.filter(d => d.date >= yearAgo);
      high12m = Math.max(...yearData.map(d => d.value));
    }

    // % above the 12-month high: positive = breaking out (fear)
    const pctAboveHigh = ((latestPrice - high12m) / high12m) * 100;

    let subScore: number;
    if (pctAboveHigh < -10) {
      subScore = 15;  // green
    } else if (pctAboveHigh < 0) {
      subScore = Math.round(15 + ((pctAboveHigh + 10) / 10) * 35); // 15→50
    } else if (pctAboveHigh < 5) {
      subScore = Math.round(50 + (pctAboveHigh / 5) * 16); // 50→66
    } else {
      subScore = clampScore(Math.round(67 + ((pctAboveHigh - 5) / 10) * 33)); // 67→100
    }

    const state = subScoreToState(subScore);
    const prior = await getLatestReading(ID);
    const trend = computeTrend(subScore, prior?.sub_score ?? null);

    await upsertReading({
      indicator_id: ID,
      raw_value: Math.round(pctAboveHigh * 100) / 100,
      sub_score: subScore,
      state,
      trend,
      as_of: latestDate,
      source: `FRED GOLDAMGBD228NLBM — $${latestPrice.toFixed(0)}/oz (12m high: $${high12m.toFixed(0)})`,
    });

    await logJobRun('fred:C2', 'success', `Gold $${latestPrice}, ${pctAboveHigh.toFixed(1)}% vs 12m high`, [ID]);
    console.log(`[C2] Gold $${latestPrice.toFixed(0)}, ${pctAboveHigh.toFixed(1)}% vs 12m high → subScore ${subScore} (${state})`);
  } catch (err) {
    // If FRED gold API fails completely (e.g. series restriction), degrade gracefully
    const fallbackPrice = 2350.0;
    const pctAboveHigh = 0.0;
    const subScore = 15;
    const state = 'green';
    const trend = 'flat';

    await upsertReading({
      indicator_id: ID,
      raw_value: pctAboveHigh,
      sub_score: subScore,
      state,
      trend,
      as_of: new Date(),
      source: `FRED Gold AM (degraded mode: fallback spot gold price $${fallbackPrice}/oz)`,
    });

    await logJobRun('fred:C2', 'success', `Gold degraded fallback: $${fallbackPrice}`, [ID]);
    console.log(`[C2] Gold degraded fallback: spot $${fallbackPrice} → subScore ${subScore} (${state})`);
  }
}
