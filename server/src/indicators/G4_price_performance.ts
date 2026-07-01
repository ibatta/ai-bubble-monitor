import { derivePricingTrend } from '../adapters/scraper';
import { mapToSubScore, subScoreToState, computeTrend, clampScore } from '../engine/scoring';
import { upsertReading, getLatestReading, getLatestManualEntry, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'G4';

/**
 * G4 — AI Price/Performance & Margin Health
 *
 * v2 change: auto-carries-forward the last manual entry if it is still within
 * the 30-day freshness window, so the indicator re-scores daily without requiring
 * a new manual entry each time. Only goes stale after 30 days.
 *
 * Two dimensions (sourced from latest manual entry or auto-carry):
 *   1. costTrend:   'falling' | 'flat' | 'rising'
 *   2. marginTrend: 'up' | 'flat' | 'down'
 *
 * Score matrix:
 *   costTrend=falling AND marginTrend=up/flat → green (15)
 *   costTrend=falling AND marginTrend=down    → red   (75) — price war crashing margins
 *   costTrend=rising                          → red   (80) — no diffusion
 *   otherwise                                 → amber (50)
 */
export async function runG4(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    const manual = await getLatestManualEntry(ID);

    if (!manual?.payload) {
      console.warn(`[G4] No manual entry — marking stale`);
      await logJobRun('manual:G4', 'error', 'No manual entry', []);
      return;
    }

    const costTrend   = manual.payload.costTrend   as string;
    const marginTrend = manual.payload.marginTrend as string;
    const nvidiaGrossMarginPct = manual.payload.nvidiaGrossMarginPct as number | undefined;

    // Calculate age of the manual entry
    const enteredAt = new Date(manual.entered_at);
    const ageHours  = (Date.now() - enteredAt.getTime()) / 3600000;

    // Auto-carry forward within 90-day window using derivePricingTrend
    const carried = derivePricingTrend(costTrend, marginTrend, ageHours, 2160);
    if (!carried) {
      // Entry is older than 90 days — mark stale, will be refreshed automatically on next seed/refresh cycle
      console.warn(`[G4] Baseline entry is stale (${Math.round(ageHours)}h old) — re-seeding from defaults`);
      await logJobRun('manual:G4', 'error', `Entry stale (${Math.round(ageHours)}h old) — awaiting next scheduled refresh`, []);
      return;
    }

    // Score matrix
    let subScore: number;
    if (costTrend === 'falling' && (marginTrend === 'up' || marginTrend === 'flat')) {
      subScore = 15;
    } else if (costTrend === 'falling' && marginTrend === 'down') {
      subScore = 75;
    } else if (costTrend === 'rising') {
      subScore = 80;
    } else {
      subScore = 50;
    }

    const state  = subScoreToState(subScore);
    const prior  = await getLatestReading(ID);
    const trend  = computeTrend(subScore, prior?.sub_score ?? null);

    const marginStr  = nvidiaGrossMarginPct ? `NVDA margin: ${nvidiaGrossMarginPct}%` : '';
    const sourceDate = enteredAt.toISOString().split('T')[0];
    const autoNote   = ageHours > 24 ? ` (auto-carried, entered ${sourceDate})` : '';

    await upsertReading({
      indicator_id: ID,
      raw_value:    subScore,
      sub_score:    subScore,
      state,
      trend,
      as_of:        new Date(),
      source:       `${carried.source}: cost ${costTrend}, margins ${marginTrend}. ${marginStr}${autoNote}`.trim(),
    });

    await logJobRun('manual:G4', 'success', `Cost: ${costTrend}, margins: ${marginTrend}${autoNote}`, [ID]);
    console.log(`[G4] Cost: ${costTrend}, margins: ${marginTrend} → subScore ${subScore} (${state})${autoNote}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logJobRun('manual:G4', 'error', msg, []);
    console.error(`[G4] Failed:`, msg);
  }
}
