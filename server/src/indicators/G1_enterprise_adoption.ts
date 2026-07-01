import { fetchBTOSAiAdoption } from '../adapters/census';
import { mapToSubScore, subScoreToState, computeTrend, clampScore } from '../engine/scoring';
import { determineFreshness } from '../engine/freshness';
import { upsertReading, getLatestReading, getLatestManualEntry, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'G1';

/**
 * G1 — Enterprise AI Adoption
 *
 * Primary: US Census BTOS AI-use % (auto).
 * Secondary: Manually-entered % from consulting surveys (Stanford HAI, McKinsey).
 *
 * Uses whichever is more recent. Falls back to manual if BTOS unavailable.
 *
 * Scoring (lower_is_risk: higher adoption = lower risk):
 *   >= 25% production deployment → green
 *   15–25% → amber
 *   < 15% → red (pilot purgatory)
 */
export async function runG1(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    // Try BTOS first
    const btos = await fetchBTOSAiAdoption().catch(() => null);

    // Try manual override
    const manual = await getLatestManualEntry(ID);

    let adoptionPct: number | null = null;
    let source = '';
    let asOf = new Date();

    if (btos && btos.pctAiUse > 0) {
      adoptionPct = btos.pctAiUse;
      source = `US Census BTOS (${btos.date})`;
      asOf = new Date(btos.date);
    } else if (manual?.payload?.adoptionPct !== undefined) {
      adoptionPct = manual.payload.adoptionPct as number;
      source = `Manual entry (${(manual.payload.surveyName as string) ?? 'survey'} — ${manual.entered_at.toISOString().split('T')[0]})`;
      asOf = manual.entered_at;
    }

    const prior = await getLatestReading(ID);

    if (adoptionPct === null && prior?.raw_value !== undefined && prior?.raw_value !== null) {
      adoptionPct = prior.raw_value;
      source = `${prior.source} (carried forward)`;
      asOf = new Date(prior.as_of);
    }

    if (adoptionPct === null) {
      console.warn(`[G1] No data available — marking stale`);
      await logJobRun('census:G1', 'error', 'No BTOS, manual, or prior data available', []);
      return;
    }


    const subScore = clampScore(mapToSubScore(config, adoptionPct));
    const state = subScoreToState(subScore);
    const trend = computeTrend(subScore, prior?.sub_score ?? null);

    await upsertReading({
      indicator_id: ID,
      raw_value: Math.round(adoptionPct * 10) / 10,
      sub_score: subScore,
      state,
      trend,
      as_of: asOf,
      source,
    });

    await logJobRun('census:G1', 'success', `Adoption: ${adoptionPct.toFixed(1)}%`, [ID]);
    console.log(`[G1] Adoption: ${adoptionPct.toFixed(1)}% → subScore ${subScore} (${state})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logJobRun('census:G1', 'error', msg, []);
    console.error(`[G1] Failed:`, msg);
  }
}
