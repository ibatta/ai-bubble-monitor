import './env';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { runMigration } from './db/migrate';
import { upsertIndicatorMeta, seedBaselineManualEntriesIfEmpty } from './db/repository';
import { INDICATOR_CONFIGS } from './config/indicators';
import apiRoutes from './api/routes';
import { registerSchedules, runAllIndicators, runCatchUp } from './jobs/scheduler';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001');

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL ?? true
    : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ─── Serve React Frontend (production) ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../web/dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  try {
    await runMigration();
    await seedBaselineManualEntriesIfEmpty();

    for (const config of INDICATOR_CONFIGS) {
      await upsertIndicatorMeta({
        id: config.id,
        name: config.name,
        light: config.light,
        tier: config.tier,
        weight: config.weight,
        direction: config.direction,
        thresholds_json: JSON.stringify(config.thresholds),
        cadence: `${config.cadenceHours}h`,
        category: config.category,
        description: config.description,
        caveat: config.caveat,
      });
    }
    console.log('[Server] Indicator metadata seeded');

    app.listen(PORT, () => {
      console.log(`[Server] Running on port ${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV ?? 'development'}`);
    });

    // Catch-up: run any indicators that lapsed during downtime
    await runCatchUp();

    // Register recurring cron schedules
    registerSchedules();

    // Also run full set once on first boot if DB is empty
    console.log('[Server] Running initial data fetch...');
    runAllIndicators().catch(err => {
      console.warn('[Server] Initial fetch failed (will retry on schedule):', err.message);
    });

  } catch (err) {
    console.error('[Server] Startup failed:', err);
    process.exit(1);
  }
}

start();
