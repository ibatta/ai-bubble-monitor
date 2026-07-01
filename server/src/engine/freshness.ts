import { IndicatorConfig, IndicatorFreshness } from '../types';

/**
 * Determines whether a reading is still within its expected refresh window.
 *
 * @param asOf - Timestamp of the most recent reading
 * @param cadenceHours - Expected refresh interval in hours
 * @param graceFactor - Multiplier for the grace window (default 1.5 = 50% grace)
 * @returns 'live' if within the grace window, 'stale' otherwise
 */
export function determineFreshness(
  asOf: Date,
  cadenceHours: number,
  graceFactor = 1.5
): IndicatorFreshness {
  const ageMs = Date.now() - asOf.getTime();
  const windowMs = cadenceHours * graceFactor * 60 * 60 * 1000;
  return ageMs <= windowMs ? 'live' : 'stale';
}

/**
 * Returns how many hours ago the reading was made (for display).
 */
export function ageHours(asOf: Date): number {
  return (Date.now() - asOf.getTime()) / (1000 * 60 * 60);
}

/**
 * Formats an age string for display.
 */
export function formatAge(asOf: Date): string {
  const hours = ageHours(asOf);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
