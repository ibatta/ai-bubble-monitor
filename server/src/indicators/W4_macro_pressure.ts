import { getFredSeriesRange, getLatestFredValue } from '../adapters/fred';
import { mapToSubScore, subScoreToState, computeTrend, clampScore } from '../engine/scoring';
import { determineFreshness } from '../engine/freshness';
import { upsertReading, getLatestReading, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'W4';

/**
 * W4 — Macro Pressure
 *
 * Composite of:
 * (a) 10-year Treasury yield 60-day change (DGS10)
 * (b) Brent crude oil 60-day % change (DCOILBRENTEU)
 * (c) 5y5y forward inflation expectation (T5YIFR)
 *
 * Scoring:
 * - Each component normalized to 0–100 contribution
 * - Final macro score = weighted average
 *
 * Thresholds:
 *   green  → score ≤ 30
 *   amber  → 31–60
 *   red    → > 60 (rates rising AND oil spiking AND inflation expectations rising)
 */
export async function runW4(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    const [dgs10Data, oilData, inflationData] = await Promise.all([
      getFredSeriesRange('DGS10', 65).catch(() => []),
      getFredSeriesRange('DCOILBRENTEU', 65).catch(() => []),
      getLatestFredValue('T5YIFR').catch(() => null),
    ]);

    const components: number[] = [];
    const sources: string[] = [];

    // (a) 10yr yield 60-day change (bps)
    if (dgs10Data.length >= 2) {
      const latest = dgs10Data[dgs10Data.length - 1].value;
      const prior60d = dgs10Data[0].value;
      const yieldChangeBps = (latest - prior60d) * 100;
      // > 50bps = elevated; > 100bps = red
      const yieldScore = Math.min(100, Math.max(0, (yieldChangeBps / 100) * 100));
      components.push(yieldScore);
      sources.push(`10yr yield Δ ${yieldChangeBps.toFixed(0)}bps`);
    }

    // (b) Brent oil 60-day % change
    if (oilData.length >= 2) {
      const latestOil = oilData[oilData.length - 1].value;
      const priorOil = oilData[0].value;
      const oilChangePct = ((latestOil - priorOil) / priorOil) * 100;
      // > 10% = amber; > 25% = red
      const oilScore = Math.min(100, Math.max(0, (oilChangePct / 25) * 100));
      components.push(oilScore);
      sources.push(`Brent oil Δ ${oilChangePct.toFixed(1)}%`);
    }

    // (c) 5y5y forward inflation expectation
    if (inflationData) {
      // Above 3% = amber/red; historical concern threshold = 2.5%
      const inflScore = Math.min(100, Math.max(0, ((inflationData.value - 2.0) / 1.5) * 100));
      components.push(inflScore);
      sources.push(`5y5y infl ${inflationData.value.toFixed(2)}%`);
    }

    if (components.length === 0) {
      throw new Error('No FRED macro data available');
    }

    const macroScore = components.reduce((a, b) => a + b, 0) / components.length;
    const subScore = clampScore(Math.round(macroScore));
    const state = subScoreToState(subScore);

    const prior = await getLatestReading(ID);
    const trend = computeTrend(subScore, prior?.sub_score ?? null);

    await upsertReading({
      indicator_id: ID,
      raw_value: Math.round(macroScore * 10) / 10,
      sub_score: subScore,
      state,
      trend,
      as_of: new Date(),
      source: `FRED: ${sources.join('; ')}`,
    });

    await logJobRun('fred:W4', 'success', `Macro score: ${macroScore.toFixed(1)} (${components.length} components)`, [ID]);
    console.log(`[W4] Macro: ${sources.join(', ')} → subScore ${subScore} (${state})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logJobRun('fred:W4', 'error', msg, []);
    console.error(`[W4] Failed:`, msg);
  }
}
