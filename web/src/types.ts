// Shared types for the frontend

export interface IndicatorReading {
  indicatorId: string;
  rawValue: number | null;
  subScore: number;
  state: 'green' | 'amber' | 'red' | 'unknown';
  trend: 'up' | 'flat' | 'down' | 'unknown';
  asOf: string;
  source: string;
  freshness: 'live' | 'stale';
}

export interface Indicator {
  id: string;
  name: string;
  light: string;
  tier: 'auto' | 'semi' | 'manual' | 'hitl';
  weight: number;
  direction: string;
  thresholds: { greenMax: number; amberMax: number };
  cadenceHours: number;
  category: 'warning' | 'allclear' | 'context';
  description: string;
  caveat: string;
  unit?: string;
  reading: IndicatorReading | null;
  history?: IndicatorReading[];
}

export interface CompositeIndex {
  score: number;
  state: 'green' | 'amber' | 'red' | 'unknown';
  band: string;
  verdict: string;
  asOf: string;
  staleCount: number;
  totalCount: number;
  contributingCount: number;
}

export interface DashboardData {
  composite: CompositeIndex;
  indicators: Indicator[];
}
