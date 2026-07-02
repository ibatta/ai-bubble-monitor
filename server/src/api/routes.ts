import { Router, Request, Response } from 'express';
import {
  getAllLatestReadings,
  getAllIndicatorMeta,
  getHistory,
  getLatestReading,
  insertManualEntry,
  getRecentJobRuns,
  getLastJobRun,
  getPendingC3Entries,
  approveC3Entry,
  rejectC3Entry,
} from '../db/repository';

import { INDICATOR_CONFIGS, getIndicatorConfig } from '../config/indicators';
import { computeComposite } from '../engine/composite';
import { determineFreshness } from '../engine/freshness';
import { FullIndicator, IndicatorFreshness } from '../types';
import { runAllIndicators } from '../jobs/scheduler';
import { getNextRunMs } from '../jobs/scheduler';

const router = Router();

// Auth middleware for admin routes
function requireAdmin(req: Request, res: Response, next: () => void) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== process.env.ADMIN_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// Helper: build FullIndicator from config + latest reading
async function buildFullIndicator(config: typeof INDICATOR_CONFIGS[0]): Promise<FullIndicator> {
  const reading = await getLatestReading(config.id);
  
  return {
    ...config,
    reading: reading
      ? {
          indicatorId: reading.indicator_id,
          rawValue: reading.raw_value,
          subScore: reading.sub_score,
          state: reading.state,
          trend: reading.trend,
          asOf: reading.as_of,
          source: reading.source,
          freshness: determineFreshness(reading.as_of, config.cadenceHours) as IndicatorFreshness,
        }
      : null,
  };
}

// ─── GET /api/index ──────────────────────────────────────────────────────────
router.get('/index', async (_req, res) => {
  try {
    const fullIndicators = await Promise.all(INDICATOR_CONFIGS.map(buildFullIndicator));
    const composite = computeComposite(fullIndicators);
    
    res.json({
      composite,
      indicators: fullIndicators,
    });
  } catch (err) {
    console.error('[API] /index error:', err);
    res.status(500).json({ error: 'Failed to compute index' });
  }
});

// ─── GET /api/indicators ─────────────────────────────────────────────────────
router.get('/indicators', async (_req, res) => {
  try {
    const fullIndicators = await Promise.all(INDICATOR_CONFIGS.map(buildFullIndicator));
    res.json(fullIndicators);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch indicators' });
  }
});

// ─── GET /api/indicators/:id ──────────────────────────────────────────────────
router.get('/indicators/:id', async (req, res) => {
  try {
    const config = getIndicatorConfig(req.params.id);
    if (!config) {
      res.status(404).json({ error: `Indicator ${req.params.id} not found` });
      return;
    }

    const full = await buildFullIndicator(config);
    const rawHistory = await getHistory(config.id);
    const history = rawHistory.map(r => ({
      indicatorId: r.indicator_id,
      rawValue: r.raw_value,
      subScore: r.sub_score,
      state: r.state,
      trend: r.trend,
      asOf: r.as_of,
      source: r.source,
    }));

    res.json({ ...full, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch indicator' });
  }
});

// ─── GET /api/history ─────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { id, from, to } = req.query as Record<string, string>;
    if (!id) {
      res.status(400).json({ error: 'id query param required' });
      return;
    }

    const history = await getHistory(
      id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined
    );

    res.json({ id, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ─── POST /api/manual/:id ────────────────────────────────────────────────────
router.post('/manual/:id', requireAdmin, async (req, res) => {
  try {
    const config = getIndicatorConfig(req.params.id);
    if (!config) {
      res.status(404).json({ error: `Indicator ${req.params.id} not found` });
      return;
    }

    const { payload, note } = req.body as { payload: Record<string, unknown>; note?: string };
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'payload object required in body' });
      return;
    }

    await insertManualEntry(config.id, payload, 'admin', note);

    // Re-run the indicator scorer immediately
    const runFn = await import(`../indicators/${config.id}_${getIndicatorFileSlug(config.id)}`);
    const keys = Object.keys(runFn).filter(k => k.startsWith('run'));
    if (keys.length > 0) {
      await runFn[keys[0]]();
    }

    res.json({ success: true, indicatorId: config.id });
  } catch (err) {
    console.error('[API] /manual error:', err);
    res.status(500).json({ error: 'Failed to save manual entry' });
  }
});

// ─── POST /api/refresh ───────────────────────────────────────────────────────
router.post('/refresh', requireAdmin, async (req, res) => {
  try {
    const { id } = req.body as { id?: string };
    
    if (id) {
      // Refresh single indicator
      const config = getIndicatorConfig(id);
      if (!config) {
        res.status(404).json({ error: `Indicator ${id} not found` });
        return;
      }
      res.json({ success: true, message: `Refreshing ${id} in background` });
      // Run async
      const runFn = await import(`../indicators/${id}_${getIndicatorFileSlug(id)}`);
      const keys = Object.keys(runFn).filter(k => k.startsWith('run'));
      if (keys.length > 0) await runFn[keys[0]]();
    } else {
      // Refresh all
      res.json({ success: true, message: 'Refreshing all indicators in background' });
      runAllIndicators().catch(console.error);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger refresh' });
  }
});

// ─── GET /api/health ─────────────────────────────────────────────────────────
// Adapter cadences (hours) used to compute nextRun
const ADAPTER_CADENCES: Record<string, number> = {
  fred:   24,
  edgar:  2160, // ~90 days
  prices: 24,
  census: 336,  // ~14 days
  news:   24,
  manual: 720,  // ~30 days
};

router.get('/health', async (_req, res) => {
  try {
    const adapters = ['fred', 'edgar', 'prices', 'census', 'news', 'manual'];
    const adapterHealth = await Promise.all(
      adapters.map(async (adapter) => {
        const lastRun     = await getLastJobRun(adapter).catch(() => null);
        const cadenceHours = ADAPTER_CADENCES[adapter] ?? 24;
        const nextRunMs    = await getNextRunMs(adapter, cadenceHours).catch(() => null);
        return {
          adapter,
          status:  lastRun?.status ?? 'never_run',
          lastRun: lastRun?.ran_at ?? null,
          nextRun: nextRunMs ? new Date(nextRunMs).toISOString() : null,
          cadenceHours,
        };
      })
    );

    const indicatorHealth = await Promise.all(
      INDICATOR_CONFIGS.map(async (config) => {
        const reading   = await getLatestReading(config.id);
        const freshness = reading
          ? determineFreshness(reading.as_of, config.cadenceHours)
          : 'stale';
        return {
          id: config.id,
          name: config.name,
          freshness,
          asOf: reading?.as_of ?? null,
        };
      })
    );

    res.json({
      status: 'ok',
      adapters: adapterHealth,
      indicators: indicatorHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Health check failed' });
  }
});


// ─── GET /api/jobs ───────────────────────────────────────────────────────────
router.get('/jobs', async (_req, res) => {
  try {
    const runs = await getRecentJobRuns(100);
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch job runs' });
  }
});

// ─── GET /api/c3/pending ──────────────────────────────────────────────────────
router.get('/c3/pending', requireAdmin, async (_req, res) => {
  try {
    const entries = await getPendingC3Entries();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending C3 entries' });
  }
});

// ─── POST /api/c3/approve/:id ─────────────────────────────────────────────────
router.post('/c3/approve/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    await approveC3Entry(id);
    const { runC3 } = await import('../indicators/C3_circular_financing');
    await runC3();
    res.json({ success: true, action: 'approved', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve C3 entry' });
  }
});

// ─── POST /api/c3/reject/:id ──────────────────────────────────────────────────
router.post('/c3/reject/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    await rejectC3Entry(id);
    res.json({ success: true, action: 'rejected', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject C3 entry' });
  }
});

// Helper: map indicator ID to file slug
function getIndicatorFileSlug(id: string): string {
  const slugs: Record<string, string> = {
    W1: 'capex_momentum',
    W2: 'capex_payoff_gap',
    W3: 'competitive_shock',
    W4: 'macro_pressure',
    W5: 'market_breadth',
    G1: 'enterprise_adoption',
    G2: 'monetization_profit',
    G3: 'customer_concentration',
    G4: 'price_performance',
    C1: 'valuation',
    C2: 'gold',
    C3: 'circular_financing',
  };
  return slugs[id] ?? id.toLowerCase();
}

export default router;
