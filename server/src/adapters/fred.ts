import axios from 'axios';

const BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const API_KEY = process.env.FRED_API_KEY;

export interface FredObservation {
  date: string;
  value: string;
}

/**
 * Fetches the N most recent observations for a FRED series.
 * Returns null values for missing data points.
 */
export async function fetchFredSeries(
  seriesId: string,
  limit = 90
): Promise<FredObservation[]> {
  if (!API_KEY) {
    throw new Error('FRED_API_KEY is not set in environment');
  }

  const response = await axios.get(BASE_URL, {
    params: {
      series_id: seriesId,
      api_key: API_KEY,
      file_type: 'json',
      sort_order: 'desc',
      limit,
    },
    headers: {
      'User-Agent': 'AI-Bubble-Monitor/1.0 (educational project)',
    },
    timeout: 15_000,
  });

  return response.data.observations as FredObservation[];
}

/**
 * Gets the most recent numeric observation from a FRED series.
 * Skips "." (missing) values.
 */
export async function getLatestFredValue(seriesId: string): Promise<{ value: number; date: string }> {
  const obs = await fetchFredSeries(seriesId, 10);
  for (const o of obs) {
    if (o.value !== '.') {
      return { value: parseFloat(o.value), date: o.date };
    }
  }
  throw new Error(`No valid data for FRED series ${seriesId}`);
}

/**
 * Gets observations for the past N days from a series, in ascending order.
 */
export async function getFredSeriesRange(
  seriesId: string,
  days = 90
): Promise<{ value: number; date: Date }[]> {
  const obs = await fetchFredSeries(seriesId, days + 10);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return obs
    .filter(o => o.value !== '.' && new Date(o.date) >= cutoff)
    .map(o => ({ value: parseFloat(o.value), date: new Date(o.date) }))
    .reverse(); // ascending
}
