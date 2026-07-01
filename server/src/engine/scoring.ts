import { IndicatorConfig, IndicatorState } from '../types';

/**
 * Maps a rawValue to a subScore (0–100) where 100 = maximum bubble/risk.
 *
 * Direction: higher_is_risk
 *   rawValue <= greenMax → score 0–33 (green)
 *   greenMax < rawValue <= amberMax → score 34–66 (amber)
 *   rawValue > amberMax → score 67–100 (red)
 *
 * Direction: lower_is_risk (inverted)
 *   rawValue >= amberMax → score 0–33 (green)  [high value = good]
 *   greenMax > rawValue >= 0 → amber
 *   rawValue < 0 → score 67–100 (red)
 *
 * Linear interpolation within each band for smooth scoring.
 */
export function mapToSubScore(config: IndicatorConfig, rawValue: number): number {
  const { direction, thresholds } = config;
  const { greenMax, amberMax } = thresholds;

  if (direction === 'higher_is_risk') {
    if (rawValue <= greenMax) {
      // interpolate 0–33 within [−∞ .. greenMax]
      const t = Math.min(Math.max(rawValue / (greenMax || 1), 0), 1);
      return Math.round(t * 33);
    } else if (rawValue <= amberMax) {
      // interpolate 34–66 within (greenMax .. amberMax]
      const t = (rawValue - greenMax) / (amberMax - greenMax);
      return Math.round(34 + t * 32);
    } else {
      // interpolate 67–100 above amberMax
      // cap at 2× amberMax for the upper reference
      const upper = amberMax * 2 || 200;
      const t = Math.min((rawValue - amberMax) / (upper - amberMax), 1);
      return Math.round(67 + t * 33);
    }
  } else {
    // lower_is_risk — invert the direction
    // green: rawValue >= amberMax (thresholds re-used as lower bounds)
    // amber: 0 <= rawValue < amberMax
    // red: rawValue < 0
    if (rawValue >= amberMax) {
      // healthy — low risk
      const t = Math.min(rawValue / (amberMax * 2 || 40), 1);
      return Math.round(33 - t * 33);
    } else if (rawValue >= 0) {
      const t = rawValue / (amberMax || 1);
      return Math.round(66 - t * 32);
    } else {
      // negative — elevated risk
      const lower = -(amberMax || 20);
      const t = Math.min((rawValue - 0) / (lower - 0), 1);
      return Math.round(67 + t * 33);
    }
  }
}

/**
 * Clamps a value to [0, 100].
 */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

/**
 * Maps a subScore to a state.
 */
export function subScoreToState(subScore: number): IndicatorState {
  if (subScore <= 33) return 'green';
  if (subScore <= 66) return 'amber';
  return 'red';
}

/**
 * Determines trend by comparing current subScore to prior.
 */
export function computeTrend(
  currentSubScore: number,
  priorSubScore: number | null,
  tolerance = 2
): 'up' | 'flat' | 'down' {
  if (priorSubScore === null) return 'flat';
  const delta = currentSubScore - priorSubScore;
  if (Math.abs(delta) <= tolerance) return 'flat';
  return delta > 0 ? 'up' : 'down';
}
