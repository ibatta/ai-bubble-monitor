import axios from 'axios';

/**
 * Claude API adapter for filing extraction and news classification.
 *
 * Uses the Anthropic Messages API (claude-3-5-haiku — fastest + cheapest for structured extraction).
 * Set CLAUDE_API_KEY in .env to enable.
 *
 * All calls use strict JSON-only prompts. On parse/validation failure the caller
 * should mark the indicator stale (never write garbage to the DB).
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // verified available, fast + cheap for extraction tasks

function getKey(): string | null {
  return process.env.CLAUDE_API_KEY ?? null;
}

interface ClaudeMessage {
  role: 'user';
  content: string;
}

async function callClaude(prompt: string, maxTokens = 512): Promise<string | null> {
  const key = getKey();
  if (!key) {
    console.warn('[Claude] CLAUDE_API_KEY not set — skipping extraction');
    return null;
  }

  try {
    const res = await axios.post(
      CLAUDE_API_URL,
      {
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt } as ClaudeMessage],
      },
      {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 30_000,
      }
    );
    return res.data?.content?.[0]?.text ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Claude] API call failed: ${msg}`);
    return null;
  }
}

// ─── Filing Extraction ────────────────────────────────────────────────────────

export interface FilingExtractionResult {
  /** Cloud / AI segment revenue in USD (absolute, not %) */
  cloudRevenue?: number | null;
  /** Operating margin as a decimal (e.g. 0.28 = 28%) */
  operatingMargin?: number | null;
  /** Free cash flow in USD */
  freeCashFlow?: number | null;
  /** Number of customers disclosed as ≥10% of revenue */
  customersAbove10PctCount?: number | null;
  /** Largest disclosed customer percentage (if stated) */
  largestCustomerPct?: number | null;
  /** Raw source note from the filing */
  sourceNote?: string;
}

const FILING_SCHEMA = `{
  "cloudRevenue": number | null,
  "operatingMargin": number | null,
  "freeCashFlow": number | null,
  "customersAbove10PctCount": number | null,
  "largestCustomerPct": number | null,
  "sourceNote": string
}`;

/**
 * Extracts structured financial data from a 10-Q or 10-K filing excerpt.
 * Returns null if extraction fails or JSON cannot be validated.
 *
 * @param filingText   - Raw text from the SEC filing (truncate to ~8000 chars before passing)
 * @param companyName  - e.g. "Microsoft", used in the prompt for context
 */
export async function extractFilingData(
  filingText: string,
  companyName: string
): Promise<FilingExtractionResult | null> {
  // Truncate to avoid token limits
  const truncated = filingText.slice(0, 8000);

  const prompt = `You are a financial data extractor. Read this SEC 10-Q/10-K filing excerpt for ${companyName} and extract ONLY the values listed below. Return ONLY valid JSON matching the schema — no explanation, no markdown, no extra text.

Schema: ${FILING_SCHEMA}

Rules:
- cloudRevenue: AI/cloud segment revenue in USD (absolute number, not percentage). null if not found.
- operatingMargin: operating income / revenue as a decimal. null if not stated.
- freeCashFlow: operating cash flow minus capex, in USD. null if not calculable.
- customersAbove10PctCount: count of customers disclosed as ≥10% of revenue. null if not mentioned.
- largestCustomerPct: the largest single disclosed customer % of revenue (e.g. 0.15 for 15%). null if not stated.
- sourceNote: one-sentence description of where you found each value.

Filing excerpt:
${truncated}

JSON only:`;

  const response = await callClaude(prompt, 600);
  if (!response) return null;

  try {
    // Strip markdown code fences if present
    const cleaned = response.replace(/^```[a-z]*\n?/m, '').replace(/```$/m, '').trim();
    const parsed  = JSON.parse(cleaned) as FilingExtractionResult;

    // Basic validation
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    return parsed;
  } catch {
    console.warn(`[Claude] Failed to parse extraction JSON for ${companyName}:`, response.slice(0, 200));
    return null;
  }
}

// ─── News Classifier (C3 Circular Financing) ─────────────────────────────────

export interface C3ClassificationResult {
  isRelevant: boolean;
  confidence: 'high' | 'medium' | 'low';
  dealType: 'vendor_financing' | 'cross_investment' | 'mega_round' | 'other' | null;
  parties: string;        // e.g. "Microsoft → OpenAI"
  estimatedAmountBn: number | null; // USD billions
  dealDate: string | null; // ISO date from article
  draftNote: string;       // 1-sentence summary for the ledger
}

/**
 * Classifies a news headline/description as a potential C3 circular-financing event.
 * Returns null if Claude is not configured or classification fails.
 */
export async function classifyC3News(
  title: string,
  description: string,
  publishedAt: string
): Promise<C3ClassificationResult | null> {
  const key = getKey();
  if (!key) return null;

  const prompt = `You are a financial analyst specializing in AI industry financing. Classify this news item for the "Circular Financing Watch" ledger of an AI bubble monitor.

Headline: ${title}
Description: ${description}
Published: ${publishedAt}

Determine if this is a circular-financing event: vendor financing, cross-investment between AI companies, or a mega-round (>$1B) involving AI infrastructure companies (OpenAI, Anthropic, Microsoft, Google, Nvidia, Meta, Amazon, Oracle, etc.).

Return ONLY valid JSON:
{
  "isRelevant": boolean,
  "confidence": "high" | "medium" | "low",
  "dealType": "vendor_financing" | "cross_investment" | "mega_round" | "other" | null,
  "parties": "string describing parties, e.g. Microsoft → OpenAI",
  "estimatedAmountBn": number | null,
  "dealDate": "YYYY-MM-DD" | null,
  "draftNote": "one-sentence summary suitable for a monitoring ledger"
}

JSON only:`;

  const response = await callClaude(prompt, 300);
  if (!response) return null;

  try {
    const cleaned = response.replace(/^```[a-z]*\n?/m, '').replace(/```$/m, '').trim();
    const parsed  = JSON.parse(cleaned) as C3ClassificationResult;
    if (typeof parsed.isRelevant !== 'boolean') return null;
    return parsed;
  } catch {
    console.warn('[Claude] Failed to parse C3 classification:', response.slice(0, 200));
    return null;
  }
}
