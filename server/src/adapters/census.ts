import axios from 'axios';

/**
 * US Census Bureau Business Trends and Outlook Survey (BTOS) adapter.
 *
 * The BTOS asks businesses about AI use. Published roughly biweekly at:
 * https://www.census.gov/data/experimental-data-products/business-trends-and-outlook-survey.html
 *
 * NOTE: The BTOS API uses a custom row/column format. The "% of businesses
 * using AI" question is identified by:
 *   - NAICS code: ALL (all sectors)
 *   - Category: AI_USE
 *
 * Verified endpoint as of 2025: https://api.census.gov/data/timeseries/eits/btos
 * See: https://www.census.gov/data/developers/data-sets/business-trends-and-outlook.html
 */

const CENSUS_BASE = 'https://api.census.gov/data/timeseries/eits/btos';

export interface BTOSDataPoint {
  date: string;
  pctAiUse: number;
}

/**
 * Fetches the latest BTOS AI-use percentage.
 *
 * NOTE: The U.S. Census Bureau does not expose the Business Trends and Outlook Survey (BTOS)
 * via its standard EITS timeseries API. BTOS is only available as PDF files and an interactive
 * JS/Tableau dashboard on their website. To avoid invalid requests and 404 errors, we return
 * null directly, letting G1 cleanly resolve to manual/analyst-entered survey baselines.
 */
export async function fetchBTOSAiAdoption(): Promise<BTOSDataPoint | null> {
  return null; // G1 will cleanly fall back to manual survey ledger entries
}
