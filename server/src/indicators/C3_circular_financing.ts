import { subScoreToState, computeTrend } from '../engine/scoring';
import { upsertReading, getLatestReading, getAllManualEntries, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'C3';

/**
 * C3 — Circular-Financing Watch
 *
 * Admin-maintained ledger of vendor financing / cross-investment deals.
 * Each entry via POST /api/manual/C3 has:
 *   { date, parties, amount, note }
 *
 * RawValue = count of deals entered in the past 12 months.
 * Score = display-only (weight = 0, not in composite).
 *
 * Thresholds:
 *   0–3 deals → green
 *   4–8 deals → amber
 *   > 8 deals → red (circular-financing becoming structural)
 */
export async function runC3(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    const allEntries = await getAllManualEntries(ID) as Array<{
      entered_at: Date;
      payload_json: string;
    }>;

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const recentEntries = allEntries.filter(
      e => new Date(e.entered_at) >= oneYearAgo
    );

    const dealCount = recentEntries.length;

    let subScore: number;
    if (dealCount <= 3) subScore = 15;
    else if (dealCount <= 8) subScore = 50;
    else subScore = 85;

    const state = subScoreToState(subScore);
    const prior = await getLatestReading(ID);
    const trend = computeTrend(subScore, prior?.sub_score ?? null);

    await upsertReading({
      indicator_id: ID,
      raw_value: dealCount,
      sub_score: subScore,
      state,
      trend,
      as_of: new Date(),
      source: `Manual ledger (${dealCount} deal${dealCount !== 1 ? 's' : ''} in past 12 months)`,
    });

    await logJobRun('manual:C3', 'success', `${dealCount} circular-financing deals`, [ID]);
    console.log(`[C3] Deals: ${dealCount} → subScore ${subScore} (${state}) [display-only]`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logJobRun('manual:C3', 'error', msg, []);
    console.error(`[C3] Failed:`, msg);
  }
}
