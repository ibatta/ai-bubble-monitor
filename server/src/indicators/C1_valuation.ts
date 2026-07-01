import { fetchCAPE } from '../adapters/scraper';
import { mapToSubScore, subScoreToState, computeTrend, clampScore } from '../engine/scoring';
import { upsertReading, getLatestReading, getLatestManualEntry, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'C1';

/**
 * C1 — Valuation Stretch (Shiller CAPE)
 *
 * Primary (auto):  Plain-HTTP scrape of multpl.com/shiller-pe.
 * Fallback (semi): Latest admin-entered value via POST /api/manual/C1.
 *
 * Change-detection: only writes a new DB reading when the scraped value
 * differs from the last one (hashed inside fetchCAPE).
 *
 * Thresholds (higher_is_risk):
 *   CAPE ≤ 25 → green
 *   25–35    → amber
 *   > 35     → red
 */
export async function runC1(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    let capeValue: number | null = null;
    let source = '';
    let changed = true;

    // ── Primary: plain-HTTP scrape ──────────────────────────────────────────
    const scraped = await fetchCAPE().catch(() => null);
    if (scraped) {
      capeValue = scraped.value;
      source    = `Auto-scrape multpl.com (${scraped.date})`;
      changed   = scraped.changed;
      console.log(`[C1] Scraped CAPE: ${capeValue} (changed: ${changed})`);
    }

    // ── Fallback: manual entry ──────────────────────────────────────────────
    if (capeValue === null) {
      const manual = await getLatestManualEntry(ID);
      const manualCape = manual?.payload?.cape as number | undefined;
      if (manualCape) {
        capeValue = manualCape;
        source    = `Manual entry (${new Date(manual!.entered_at).toISOString().split('T')[0]})`;
      }
    }

    if (capeValue === null) {
      // Try carrying forward the last DB reading before giving up
      const prior = await getLatestReading(ID);
      if (prior?.raw_value != null) {
        capeValue = prior.raw_value;
        source    = `${prior.source} (auto carried forward)`;
        changed   = false; // don't re-write unchanged value
        console.log(`[C1] Scraper unavailable — carrying forward prior CAPE: ${capeValue}`);
      } else {
        console.warn('[C1] No CAPE data available — will retry on next scheduled run');
        await logJobRun('semi:C1', 'error', 'No CAPE data — will retry on schedule', []);
        return;
      }
    }

    // Skip write if value hasn't changed (reduces DB noise on monthly cadence)
    if (!changed) {
      console.log(`[C1] CAPE unchanged at ${capeValue} — skipping write`);
      await logJobRun('semi:C1', 'success', `CAPE unchanged: ${capeValue}`, [ID]);
      return;
    }

    const subScore = clampScore(mapToSubScore(config, capeValue));
    const state    = subScoreToState(subScore);
    const prior    = await getLatestReading(ID);
    const trend    = computeTrend(subScore, prior?.sub_score ?? null);

    await upsertReading({
      indicator_id: ID,
      raw_value:    capeValue,
      sub_score:    subScore,
      state,
      trend,
      as_of:        new Date(),
      source,
    });

    await logJobRun('semi:C1', 'success', `CAPE: ${capeValue}`, [ID]);
    console.log(`[C1] CAPE: ${capeValue} → subScore ${subScore} (${state})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logJobRun('semi:C1', 'error', msg, []);
    console.error(`[C1] Failed:`, msg);
  }
}
