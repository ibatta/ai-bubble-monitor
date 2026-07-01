import { FullIndicator, CompositeIndex, IndicatorState } from '../types';
import { subScoreToState } from './scoring';

/**
 * Computes the Bubble Pressure Index from a list of indicators.
 *
 * Formula: Σ(subScore_i × weight_i) / Σ(weight_i)
 *
 * Rules:
 * - Stale indicators (freshness === 'stale') are EXCLUDED from the weighted average
 * - Context indicators (weight = 0) are EXCLUDED from the composite
 * - If all indicators are stale, return score = -1 (unknown)
 */
export function computeComposite(indicators: FullIndicator[]): CompositeIndex {
  const now = new Date();
  
  let weightedSum = 0;
  let totalWeight = 0;
  let staleCount = 0;
  let contributingCount = 0;

  for (const ind of indicators) {
    // Skip context indicators with zero weight
    if (ind.weight === 0) continue;

    if (!ind.reading || ind.reading.freshness === 'stale') {
      staleCount++;
      continue;
    }

    weightedSum += ind.reading.subScore * ind.weight;
    totalWeight += ind.weight;
    contributingCount++;
  }

  const staleIndicators = indicators.filter(i => i.weight === 0 ? false : (!i.reading || i.reading.freshness === 'stale'));
  const totalTracked = indicators.filter(i => i.weight > 0).length;

  if (totalWeight === 0) {
    return {
      score: 0,
      state: 'unknown' as IndicatorState,
      band: 'Unknown',
      verdict: 'Insufficient data to compute the index. Check data source health.',
      asOf: now,
      staleCount,
      totalCount: totalTracked,
      contributingCount: 0,
    };
  }

  const score = Math.round(weightedSum / totalWeight);
  const state = subScoreToState(score);
  const band = scoreToBand(score);
  const verdict = buildVerdict(score, state, staleCount, indicators);

  return {
    score,
    state,
    band,
    verdict,
    asOf: now,
    staleCount,
    totalCount: totalTracked,
    contributingCount,
  };
}

function scoreToBand(score: number): string {
  if (score <= 33) return 'Healthy';
  if (score <= 66) return 'Caution';
  return 'Elevated Risk';
}

function buildVerdict(
  score: number,
  state: IndicatorState,
  staleCount: number,
  indicators: FullIndicator[]
): string {
  const redCount = indicators.filter(i => i.reading?.state === 'red').length;
  const amberCount = indicators.filter(i => i.reading?.state === 'amber').length;

  let verdict = '';

  if (state === 'green') {
    verdict = `All-clear — most signals look healthy (score ${score}/100).`;
  } else if (state === 'amber') {
    verdict = `Caution — ${amberCount} indicator${amberCount !== 1 ? 's' : ''} flashing amber (score ${score}/100). Monitor closely.`;
  } else {
    verdict = `Elevated risk — ${redCount} warning light${redCount !== 1 ? 's' : ''} red (score ${score}/100). Review flagged indicators.`;
  }

  if (staleCount > 0) {
    verdict += ` (${staleCount} stale indicator${staleCount !== 1 ? 's' : ''} excluded from score.)`;
  }

  return verdict;
}
