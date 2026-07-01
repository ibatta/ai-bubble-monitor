import axios from 'axios';
import { logJobRun, insertPendingC3Entry } from '../db/repository';
import { classifyC3News } from '../adapters/claude';

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const BASE_URL = 'https://newsapi.org/v2/everything';

// Keywords for competitive shock (Layer B of W3)
const SHOCK_KEYWORDS = [
  'efficient model',
  'training cost',
  'open-source frontier',
  'cheaper inference',
  'AI cost reduction',
  'model distillation',
  'low cost AI',
  'DeepSeek',
  'Mistral',
  'Llama',
  'open weights',
];

// Keywords for C3 circular-financing detection
const C3_KEYWORDS = [
  'AI investment',
  'venture round',
  'billion funding',
  'vendor financing',
  'Microsoft OpenAI',
  'Google Anthropic',
  'Amazon Anthropic',
  'Nvidia investment',
  'hyperscaler deal',
  'AI mega round',
  'strategic investment AI',
];

export interface NewsHeadline {
  title: string;
  description: string;
  publishedAt: string;
  source: string;
  url: string;
  relevanceFlag: boolean;
}

/**
 * Fetches recent AI-competition headlines (W3 Layer B).
 */
export async function fetchCompetitorNewsHeadlines(): Promise<NewsHeadline[]> {
  if (!NEWS_API_KEY) {
    console.log('[News] NEWS_API_KEY not set — skipping news layer');
    return [];
  }

  const query = SHOCK_KEYWORDS.slice(0, 5).join(' OR ');

  try {
    const response = await axios.get(BASE_URL, {
      params: {
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 20,
        apiKey: NEWS_API_KEY,
      },
      timeout: 10_000,
    });

    const articles = response.data.articles ?? [];
    await logJobRun('news', 'success', `Fetched ${articles.length} news articles`);
    return articles.map((a: Record<string, unknown>) => ({
      title:         a.title as string,
      description:   a.description as string,
      publishedAt:   a.publishedAt as string,
      source:        (a.source as Record<string, string>)?.name ?? 'Unknown',
      url:           a.url as string,
      relevanceFlag: SHOCK_KEYWORDS.some(k =>
        ((a.title as string) ?? '').toLowerCase().includes(k.toLowerCase())
      ),
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[News] Failed to fetch headlines:', msg);
    await logJobRun('news', 'error', `Failed to fetch headlines: ${msg}`);
    return [];
  }
}

/**
 * Counts recent relevant headlines for W3 Layer B soft-flag.
 */
export async function getRecentShockHeadlineCount(): Promise<number> {
  const headlines = await fetchCompetitorNewsHeadlines();
  const cutoff    = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  return headlines.filter(h => h.relevanceFlag && new Date(h.publishedAt) >= cutoff).length;
}

/**
 * Fetches C3-relevant headlines and runs them through the Claude classifier.
 * Any high/medium-confidence matches are saved as pending C3 ledger entries
 * for human review via the /api/c3/pending queue.
 *
 * Runs on the same cadence as the news adapter (daily).
 */
export async function scanC3CircularFinancing(): Promise<void> {
  if (!NEWS_API_KEY) return;

  const query = C3_KEYWORDS.slice(0, 5).join(' OR ');

  try {
    const response = await axios.get(BASE_URL, {
      params: {
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 15,
        apiKey: NEWS_API_KEY,
      },
      timeout: 10_000,
    });

    const articles = (response.data.articles ?? []) as Record<string, unknown>[];
    let drafted = 0;

    for (const article of articles) {
      const title       = (article.title as string)       ?? '';
      const description = (article.description as string) ?? '';
      const publishedAt = (article.publishedAt as string) ?? new Date().toISOString();
      const url         = (article.url as string)         ?? '';

      if (!title) continue;

      // Run Claude classifier
      const classification = await classifyC3News(title, description, publishedAt).catch(() => null);

      if (classification?.isRelevant &&
          (classification.confidence === 'high' || classification.confidence === 'medium')) {
        await insertPendingC3Entry({
          parties:           classification.parties,
          dealType:          classification.dealType ?? 'other',
          estimatedAmountBn: classification.estimatedAmountBn,
          dealDate:          classification.dealDate ?? publishedAt.split('T')[0],
          draftNote:         classification.draftNote,
          sourceUrl:         url,
          confidence:        classification.confidence,
        }).catch(err => console.warn('[News] Failed to insert pending C3 entry:', err));
        drafted++;
      }
    }

    if (drafted > 0) {
      console.log(`[News] C3 scanner: drafted ${drafted} pending entries for review`);
    }

    await logJobRun('news:C3scan', 'success', `Scanned ${articles.length} articles, drafted ${drafted} C3 entries`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[News] C3 scan failed:', msg);
    await logJobRun('news:C3scan', 'error', msg);
  }
}
