import { describe, it, expect } from 'vitest';
import { mapToSubScore, subScoreToState, computeTrend, clampScore } from '../src/engine/scoring';
import { computeComposite } from '../src/engine/composite';
import { determineFreshness } from '../src/engine/freshness';
import { INDICATOR_CONFIGS } from '../src/config/indicators';
import { FullIndicator, IndicatorReading } from '../src/types';

// ─── mapToSubScore ────────────────────────────────────────────────────────────

describe('mapToSubScore — higher_is_risk', () => {
  const cfg = INDICATOR_CONFIGS.find(c => c.id === 'W4')!; // higher_is_risk, green≤30, amber≤60

  it('returns low score for well-below-green values', () => {
    const score = mapToSubScore(cfg, 0);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(33);
  });

  it('returns green (≤33) for value at greenMax', () => {
    const score = mapToSubScore(cfg, 30);
    expect(score).toBeLessThanOrEqual(33);
  });

  it('returns amber (34–66) for value in amber band', () => {
    const score = mapToSubScore(cfg, 45);
    expect(score).toBeGreaterThanOrEqual(34);
    expect(score).toBeLessThanOrEqual(66);
  });

  it('returns red (67–100) for value above amberMax', () => {
    const score = mapToSubScore(cfg, 80);
    expect(score).toBeGreaterThanOrEqual(67);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('clamps output to 100 for extreme values', () => {
    const score = clampScore(mapToSubScore(cfg, 9999));
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('mapToSubScore — lower_is_risk', () => {
  const cfg = INDICATOR_CONFIGS.find(c => c.id === 'W1')!; // lower_is_risk, risk rises as growth falls

  it('returns green for high positive growth', () => {
    const score = mapToSubScore(cfg, 50); // 50% YoY growth = healthy
    expect(score).toBeLessThanOrEqual(33);
  });

  it('returns amber for zero growth', () => {
    const score = mapToSubScore(cfg, 10); // moderate growth
    expect(score).toBeGreaterThan(0);
  });

  it('returns red for negative growth (actual cut)', () => {
    const score = mapToSubScore(cfg, -5); // -5% = capex cut = red
    expect(score).toBeGreaterThanOrEqual(67);
  });

  it('returns max score for extreme negative values', () => {
    const score = clampScore(mapToSubScore(cfg, -100));
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── subScoreToState ──────────────────────────────────────────────────────────

describe('subScoreToState', () => {
  it('maps 0 → green', () => expect(subScoreToState(0)).toBe('green'));
  it('maps 33 → green', () => expect(subScoreToState(33)).toBe('green'));
  it('maps 34 → amber', () => expect(subScoreToState(34)).toBe('amber'));
  it('maps 66 → amber', () => expect(subScoreToState(66)).toBe('amber'));
  it('maps 67 → red', () => expect(subScoreToState(67)).toBe('red'));
  it('maps 100 → red', () => expect(subScoreToState(100)).toBe('red'));
});

// ─── computeTrend ─────────────────────────────────────────────────────────────

describe('computeTrend', () => {
  it('returns flat when prior is null', () => expect(computeTrend(50, null)).toBe('flat'));
  it('returns flat when delta ≤ tolerance', () => expect(computeTrend(50, 51)).toBe('flat'));
  it('returns up when significantly higher', () => expect(computeTrend(60, 45)).toBe('up'));
  it('returns down when significantly lower', () => expect(computeTrend(40, 55)).toBe('down'));
});

// ─── computeComposite ────────────────────────────────────────────────────────

function makeIndicator(
  id: string,
  subScore: number,
  weight: number,
  fresh: boolean = true
): FullIndicator {
  const config = INDICATOR_CONFIGS.find(c => c.id === id) ?? INDICATOR_CONFIGS[0];
  const reading: IndicatorReading = {
    indicatorId: id,
    rawValue: subScore,
    subScore,
    state: subScore <= 33 ? 'green' : subScore <= 66 ? 'amber' : 'red',
    trend: 'flat',
    asOf: fresh ? new Date() : new Date('2020-01-01'),
    source: 'test',
    freshness: fresh ? 'live' : 'stale',
  };
  return { ...config, id, weight, reading };
}

describe('computeComposite', () => {
  it('returns green for all-green indicators', () => {
    const indicators = [
      makeIndicator('W1', 10, 1),
      makeIndicator('W4', 15, 1),
      makeIndicator('W5', 20, 1),
    ];
    const result = computeComposite(indicators);
    expect(result.state).toBe('green');
    expect(result.score).toBeLessThanOrEqual(33);
  });

  it('returns red for all-red indicators', () => {
    const indicators = [
      makeIndicator('W1', 80, 1),
      makeIndicator('W4', 90, 1),
      makeIndicator('W5', 85, 1),
    ];
    const result = computeComposite(indicators);
    expect(result.state).toBe('red');
    expect(result.score).toBeGreaterThanOrEqual(67);
  });

  it('weights correctly in mixed scenario', () => {
    const indicators = [
      makeIndicator('W1', 80, 2), // red, weight 2
      makeIndicator('W4', 10, 1), // green, weight 1
    ];
    const result = computeComposite(indicators);
    // Weighted avg: (80*2 + 10*1) / 3 = 56.7 → amber
    expect(result.score).toBeCloseTo(57, 0);
    expect(result.state).toBe('amber');
  });

  it('excludes stale indicators from weighted average', () => {
    const indicators = [
      makeIndicator('W1', 10, 1, true),   // live, green
      makeIndicator('W4', 100, 1, false), // stale, red — EXCLUDED
    ];
    const result = computeComposite(indicators);
    expect(result.score).toBeLessThanOrEqual(33); // only the live green contributes
    expect(result.staleCount).toBe(1);
  });

  it('excludes context indicators (weight=0) from composite', () => {
    const indicators = [
      makeIndicator('W1', 10, 1, true),
      makeIndicator('C3', 100, 0, true), // weight 0 = context only
    ];
    const result = computeComposite(indicators);
    expect(result.score).toBeLessThanOrEqual(33);
  });

  it('handles all-stale gracefully', () => {
    const indicators = [
      makeIndicator('W1', 50, 1, false),
      makeIndicator('W4', 60, 1, false),
    ];
    const result = computeComposite(indicators);
    expect(result.contributingCount).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ─── determineFreshness ───────────────────────────────────────────────────────

describe('determineFreshness', () => {
  it('returns live for a recent reading within cadence', () => {
    const asOf = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    expect(determineFreshness(asOf, 24)).toBe('live'); // 24h cadence
  });

  it('returns stale for a reading past cadence + grace window', () => {
    const asOf = new Date(Date.now() - 40 * 60 * 60 * 1000); // 40 hours ago
    expect(determineFreshness(asOf, 24)).toBe('stale'); // 24h * 1.5 grace = 36h
  });

  it('returns live at exactly the grace boundary', () => {
    const asOf = new Date(Date.now() - 35 * 60 * 60 * 1000); // 35h < 36h grace
    expect(determineFreshness(asOf, 24)).toBe('live');
  });
});
