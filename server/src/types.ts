// ─── Core Types for AI Bubble Monitor ───────────────────────────────────────

export type IndicatorState = 'green' | 'amber' | 'red' | 'unknown';
export type IndicatorTrend = 'up' | 'flat' | 'down' | 'unknown';
export type IndicatorTier = 'auto' | 'semi' | 'manual' | 'hitl';
export type IndicatorFreshness = 'live' | 'stale';
export type IndicatorCategory = 'warning' | 'allclear' | 'context';
export type IndicatorDirection = 'higher_is_risk' | 'lower_is_risk';

export interface Threshold {
  greenMax: number;   // rawValue <= this = green (for higher_is_risk)
  amberMax: number;   // rawValue <= this = amber
  // above amberMax = red
}

export interface IndicatorConfig {
  id: string;
  name: string;
  light: string;           // plain-English light description
  tier: IndicatorTier;
  weight: number;
  direction: IndicatorDirection;
  thresholds: Threshold;
  cadenceHours: number;    // expected refresh window in hours
  category: IndicatorCategory;
  description: string;     // how it's measured (tooltip)
  caveat: string;          // honesty caveat
  unit?: string;           // display unit (e.g. '%', 'bps', '$')
}

export interface IndicatorReading {
  indicatorId: string;
  rawValue: number | null;
  subScore: number;        // 0–100
  state: IndicatorState;
  trend: IndicatorTrend;
  asOf: Date;
  source: string;
  freshness: IndicatorFreshness;
}

export interface FullIndicator extends IndicatorConfig {
  reading: IndicatorReading | null;
}

export interface CompositeIndex {
  score: number;           // 0–100
  state: IndicatorState;
  band: string;            // 'Healthy' | 'Caution' | 'Elevated Risk'
  verdict: string;         // plain-English one-liner
  asOf: Date;
  staleCount: number;
  totalCount: number;
  contributingCount: number;
}

export interface AdapterResult {
  indicatorId: string;
  rawValue: number;
  asOf: Date;
  source: string;
}
