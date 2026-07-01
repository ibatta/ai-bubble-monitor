import { getMaxSingleDayDrop } from '../adapters/prices';
import { getRecentShockHeadlineCount } from '../adapters/news';
import { W3_SHOCK_DECAY_DAYS, W3_RED_DRAWDOWN_PCT, W3_AMBER_DRAWDOWN_PCT } from '../config/indicators';
import { subScoreToState, computeTrend } from '../engine/scoring';
import { determineFreshness } from '../engine/freshness';
import { upsertReading, getLatestReading, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'W3';

/**
 * W3 — Competitive Shock Monitor
 *
 * Layer A (auto): max single-day drawdown for NVDA over trailing 5 days.
 * Score:
 *   < amber threshold → 0 (no shock)
 *   amber threshold (4%) → 50
 *   red threshold (7%+) → 100
 *
 * Score decays from 100 to 0 over W3_SHOCK_DECAY_DAYS if no follow-through.
 *
 * Layer B (optional): news headline count adds a soft bonus.
 */
export async function runW3(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    const [nvdaDrop, headlineCount] = await Promise.all([
      getMaxSingleDayDrop('NVDA', 5).catch(() => 0),
      getRecentShockHeadlineCount().catch(() => 0),
    ]);

    // Compute base shock score
    let shockScore = 0;
    if (nvdaDrop >= W3_RED_DRAWDOWN_PCT) {
      shockScore = 100;
    } else if (nvdaDrop >= W3_AMBER_DRAWDOWN_PCT) {
      // Linear between amber and red
      shockScore = 50 + ((nvdaDrop - W3_AMBER_DRAWDOWN_PCT) / (W3_RED_DRAWDOWN_PCT - W3_AMBER_DRAWDOWN_PCT)) * 50;
    }

    // Layer B: news adds up to 20 points of soft signal
    const newsBonus = Math.min(headlineCount * 5, 20);
    const rawScore = Math.min(100, shockScore + newsBonus);

    // Decay: check prior reading age
    const prior = await getLatestReading(ID);
    let finalScore = rawScore;

    if (prior && rawScore < prior.sub_score) {
      // Apply decay from prior score
      const ageMs = Date.now() - new Date(prior.as_of).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const decayFraction = Math.min(ageDays / W3_SHOCK_DECAY_DAYS, 1);
      finalScore = Math.max(rawScore, prior.sub_score * (1 - decayFraction));
    }

    const subScore = Math.round(Math.min(100, Math.max(0, finalScore)));
    const state = subScoreToState(subScore);
    const trend = computeTrend(subScore, prior?.sub_score ?? null);

    await upsertReading({
      indicator_id: ID,
      raw_value: Math.round(nvdaDrop * 100) / 100,
      sub_score: subScore,
      state,
      trend,
      as_of: new Date(),
      source: `Alpha Vantage (NVDA 5-day max drop: ${nvdaDrop.toFixed(1)}%; headlines: ${headlineCount})`,
    });

    await logJobRun('prices:W3', 'success', `NVDA max drop: ${nvdaDrop.toFixed(1)}%, score: ${subScore}`, [ID]);
    console.log(`[W3] NVDA drop: ${nvdaDrop.toFixed(1)}%, news: ${headlineCount} → subScore ${subScore} (${state})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[W3] Live fetch failed (${msg}) — checking DB for prior reading...`);
    const prior = await getLatestReading(ID);
    if (prior) {
      console.log(`[W3] Carrying forward prior reading (score: ${prior.sub_score})`);
      await logJobRun('prices:W3', 'success', `Carried forward prior DB reading (${msg})`, [ID]);
    } else {
      await logJobRun('prices:W3', 'error', msg, []);
      console.error(`[W3] Failed and no prior DB reading exists:`, msg);
    }
  }
}
