import cron from 'node-cron';
import { runW1 } from '../indicators/W1_capex_momentum';
import { runW2 } from '../indicators/W2_capex_payoff_gap';
import { runW3 } from '../indicators/W3_competitive_shock';
import { runW4 } from '../indicators/W4_macro_pressure';
import { runW5 } from '../indicators/W5_market_breadth';
import { runG1 } from '../indicators/G1_enterprise_adoption';
import { runG2 } from '../indicators/G2_monetization_profit';
import { runG3 } from '../indicators/G3_customer_concentration';
import { runG4 } from '../indicators/G4_price_performance';
import { runC1 } from '../indicators/C1_valuation';
import { runC2 } from '../indicators/C2_gold';
import { runC3 } from '../indicators/C3_circular_financing';
import { checkAndAlert } from './alerter';
import { getLastJobRun } from '../db/repository';
import { scanC3CircularFinancing } from '../adapters/news';

// Per-indicator cadence in hours (mirrors config/indicators cadenceHours)
const INDICATOR_CADENCES: Record<string, { run: () => Promise<void>; cadenceHours: number; adapterKey: string }> = {
  W3: { run: runW3,  cadenceHours: 24,   adapterKey: 'prices:W3'  },
  W4: { run: runW4,  cadenceHours: 24,   adapterKey: 'fred:W4'    },
  W5: { run: runW5,  cadenceHours: 24,   adapterKey: 'prices:W5'  },
  C2: { run: runC2,  cadenceHours: 24,   adapterKey: 'prices:C2'  },
  G1: { run: runG1,  cadenceHours: 336,  adapterKey: 'census:G1'  }, // ~14 days
  C1: { run: runC1,  cadenceHours: 720,  adapterKey: 'semi:C1'    }, // ~30 days
  C3: { run: runC3,  cadenceHours: 720,  adapterKey: 'manual:C3'  },
  W1: { run: runW1,  cadenceHours: 2160, adapterKey: 'edgar:W1'   }, // ~90 days
  W2: { run: runW2,  cadenceHours: 2160, adapterKey: 'edgar:W2'   },
  G2: { run: runG2,  cadenceHours: 2160, adapterKey: 'edgar:G2'   },
  G3: { run: runG3,  cadenceHours: 2160, adapterKey: 'manual:G3'  },
  G4: { run: runG4,  cadenceHours: 24,   adapterKey: 'manual:G4'  },
};

/**
 * On boot: run any indicator whose cadence window has elapsed since
 * its last recorded job_run entry, so downtime self-heals.
 */
export async function runCatchUp(): Promise<void> {
  console.log('[Scheduler] Running catch-up check...');
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  for (const [id, { run, cadenceHours, adapterKey }] of Object.entries(INDICATOR_CADENCES)) {
    try {
      const lastRun = await getLastJobRun(adapterKey);
      const nowMs   = Date.now();
      const windowMs = cadenceHours * 60 * 60 * 1000;

      const lastRunMs = lastRun?.ran_at ? new Date(lastRun.ran_at).getTime() : 0;
      const elapsed   = nowMs - lastRunMs;

      if (elapsed >= windowMs) {
        console.log(`[Scheduler] Catch-up: ${id} (last ran ${Math.round(elapsed / 3600000)}h ago, window ${cadenceHours}h)`);
        await run().catch(err => console.warn(`[Scheduler] Catch-up failed for ${id}:`, err.message));
        await delay(1000); // brief pause between catch-up runs
      } else {
        const remainHours = Math.round((windowMs - elapsed) / 3600000);
        console.log(`[Scheduler] ${id} is fresh (next run in ~${remainHours}h)`);
      }
    } catch (err) {
      console.warn(`[Scheduler] Catch-up check failed for ${id}:`, err);
    }
  }

  console.log('[Scheduler] Catch-up check complete');
}

/**
 * Returns the next scheduled run time for a given adapter key (UTC ms).
 * Used by /api/health to show "next run in Xh" on the UI.
 */
export async function getNextRunMs(adapterKey: string, cadenceHours: number): Promise<number | null> {
  try {
    const lastRun = await getLastJobRun(adapterKey);
    if (!lastRun?.ran_at) return Date.now(); // never run → schedule now
    const lastRunMs = new Date(lastRun.ran_at).getTime();
    return lastRunMs + cadenceHours * 3600000;
  } catch {
    return null;
  }
}

/**
 * Runs all indicators (used for initial boot population and manual /refresh).
 */
export async function runAllIndicators(): Promise<void> {
  console.log('[Scheduler] Running all indicators...');

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
  await runW3();
  await delay(2000);
  await runW5();
  await delay(2000);
  await runC2();

  await runW4();

  await Promise.allSettled([runW1(), runW2(), runG2()]);
  await Promise.allSettled([runG1(), runG3(), runG4(), runC1(), runC3()]);

  await checkAndAlert();
  console.log('[Scheduler] All indicators updated');
}

/**
 * Registers all cron schedules.
 *
 * Cadences:
 * - Daily (market open): W3, W4, W5, C2 → every weekday at 09:00 UTC
 * - Biweekly: G1 → weekly on Mondays
 * - Monthly: C1, C3 → 1st of each month
 * - Quarterly: W1, W2, G2 → 1st of Jan/Apr/Jul/Oct
 * - Daily re-score: G3, G4 → picks up any new manual entries
 */
export function registerSchedules(): void {
  cron.schedule('0 9 * * 1-5', async () => {
    console.log('[Scheduler] Daily run triggered');
    await Promise.allSettled([runW3(), runW4(), runW5(), runC2()]);
    // Run C3 news classifier scan daily after market data
    await scanC3CircularFinancing().catch(err => console.warn('[Scheduler] C3 scan failed:', err.message));
    await checkAndAlert();
  });

  cron.schedule('0 8 * * 1', async () => {
    console.log('[Scheduler] Weekly run — G1');
    await runG1();
  });

  cron.schedule('0 7 1 * *', async () => {
    console.log('[Scheduler] Monthly run — C1, C3');
    await Promise.allSettled([runC1(), runC3()]);
  });

  cron.schedule('0 6 1 1,4,7,10 *', async () => {
    console.log('[Scheduler] Quarterly run — W1, W2, G2');
    await Promise.allSettled([runW1(), runW2(), runG2()]);
  });

  cron.schedule('0 10 * * *', async () => {
    console.log('[Scheduler] Daily re-score — G3, G4');
    await Promise.allSettled([runG3(), runG4()]);
    await checkAndAlert();
  });

  console.log('[Scheduler] All cron schedules registered');
}
