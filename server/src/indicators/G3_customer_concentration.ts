import { fetchCompanyFacts } from '../adapters/edgar';
import { extractFilingData } from '../adapters/claude';
import { mapToSubScore, subScoreToState, computeTrend, clampScore } from '../engine/scoring';
import { upsertReading, getLatestReading, getLatestManualEntry, logJobRun } from '../db/repository';
import { getIndicatorConfig } from '../config/indicators';

const ID = 'G3';

// Nvidia is the primary subject for customer concentration
const NVDA_CIK = '0001045810';

/**
 * G3 — Customer Concentration (Nvidia)
 *
 * v2 change: Now attempts EDGAR + Claude extraction for the publicly-disclosed
 * customer concentration language from Nvidia's 10-K/10-Q filings.
 *
 * Priority:
 *   1. EDGAR XBRL + Claude: extract disclosed "customers ≥10% of revenue" count
 *      and convert to a proxy top-4 share estimate.
 *   2. Manual overlay: admin-entered top-4 analyst estimate (optional, overrides
 *      EDGAR result if entered within the freshness window).
 *
 * Thresholds (higher_is_risk):
 *   < 50% → green
 *   50–65% → amber
 *   > 65%  → red
 */
export async function runG3(): Promise<void> {
  const config = getIndicatorConfig(ID)!;

  try {
    let top4SharePct: number | null = null;
    let source = '';

    // ── 1. EDGAR + Claude extraction ─────────────────────────────────────────
    try {
      const facts = await fetchCompanyFacts('NVDA');
      const entityName = facts.entityName ?? 'Nvidia';

      // Build a text representation of recent financial data for Claude
      const xbrlSummary = JSON.stringify(
        Object.fromEntries(
          Object.entries(facts.facts?.['us-gaap'] ?? {})
            .filter(([k]) => k.toLowerCase().includes('customer') ||
                             k.toLowerCase().includes('concentration') ||
                             k.toLowerCase().includes('revenue'))
            .slice(0, 15)
            .map(([k, v]) => [k, (v as { units?: { USD?: unknown[] } }).units?.USD?.slice(-3)])
        )
      );

      const extracted = await extractFilingData(
        `${entityName} 10-K customer concentration data:\n${xbrlSummary}`,
        entityName
      );

      if (extracted?.customersAbove10PctCount !== null && extracted?.customersAbove10PctCount !== undefined) {
        const count = extracted.customersAbove10PctCount;
        // Heuristic: convert disclosed ≥10% count to top-4 share estimate
        // Each customer at ≥10% contributes approximately 13-18% on average
        const estimatedShare = Math.min(95, count * 15);
        top4SharePct = estimatedShare;
        source = `EDGAR+Claude (${count} customers ≥10% revenue → ~${estimatedShare}% estimated top-4 share)`;
        console.log(`[G3] Claude extracted: ${count} customers ≥10% → estimated top-4 share: ${estimatedShare}%`);
      }
    } catch (edgarErr) {
      console.warn('[G3] EDGAR+Claude extraction failed:', edgarErr);
    }

    // ── 2. Manual overlay (takes precedence if admin entered a recent value) ─
    const manual = await getLatestManualEntry(ID);
    if (manual?.payload?.top4SharePct) {
      const manualAge = (Date.now() - new Date(manual.entered_at).getTime()) / 3600000;
      if (manualAge < 2160) { // within ~90 days — treat as authoritative
        top4SharePct = manual.payload.top4SharePct as number;
        const sourceName = (manual.payload.sourceName as string) ?? 'analyst estimate';
        const sourceDate = new Date(manual.entered_at).toISOString().split('T')[0];
        source = `Manual overlay: ${sourceName} (${sourceDate}) [overrides EDGAR]`;
        console.log(`[G3] Manual override used: top-4 share ${top4SharePct}%`);
      }
    }

    const prior = await getLatestReading(ID);

    if (top4SharePct === null && prior?.raw_value !== undefined && prior?.raw_value !== null) {
      top4SharePct = prior.raw_value;
      source = `${prior.source} (carried forward)`;
    }

    if (top4SharePct === null) {
      console.warn('[G3] No data from EDGAR+Claude or manual entry — marking stale');
      await logJobRun('manual:G3', 'error', 'No top-4 share data (EDGAR+Claude and manual both unavailable)', []);
      return;
    }


    const subScore = clampScore(mapToSubScore(config, top4SharePct));
    const state    = subScoreToState(subScore);
    const trend    = computeTrend(subScore, prior?.sub_score ?? null);

    await upsertReading({
      indicator_id: ID,
      raw_value:    top4SharePct,
      sub_score:    subScore,
      state,
      trend,
      as_of:        new Date(),
      source,
    });

    await logJobRun('manual:G3', 'success', `Top-4 share: ${top4SharePct}%`, [ID]);
    console.log(`[G3] Top-4 share: ${top4SharePct}% → subScore ${subScore} (${state})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logJobRun('manual:G3', 'error', msg, []);
    console.error(`[G3] Failed:`, msg);
  }
}
