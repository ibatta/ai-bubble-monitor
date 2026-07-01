import { getPool, getSqlite, isProduction } from './migrate';
import { IndicatorState } from '../types';

export interface DbReading {
  id: number;
  indicator_id: string;
  raw_value: number | null;
  sub_score: number;
  state: IndicatorState;
  trend: 'up' | 'flat' | 'down' | 'unknown';
  as_of: Date;
  source: string;
  fetched_at: Date;
}

export interface DbIndicator {
  id: string;
  name: string;
  light: string;
  tier: string;
  weight: number;
  direction: string;
  thresholds_json: string;
  cadence: string;
  category: string;
  description: string;
  caveat: string;
}

function normalizeDate(d: string | Date | number): Date {
  if (typeof d === 'string' && !d.endsWith('Z') && d.indexOf(' ') > 0) {
    // SQLite local time string cleanup
    return new Date(d.replace(' ', 'T') + 'Z');
  }
  return new Date(d);
}

// ─── Indicators ──────────────────────────────────────────────────────────────

export async function upsertIndicatorMeta(indicator: DbIndicator): Promise<void> {
  if (isProduction) {
    const db = getPool();
    await db.query(
      `INSERT INTO indicators (id, name, light, tier, weight, direction, thresholds_json, cadence, category, description, caveat)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         light = EXCLUDED.light,
         tier = EXCLUDED.tier,
         weight = EXCLUDED.weight,
         direction = EXCLUDED.direction,
         thresholds_json = EXCLUDED.thresholds_json,
         cadence = EXCLUDED.cadence,
         category = EXCLUDED.category,
         description = EXCLUDED.description,
         caveat = EXCLUDED.caveat`,
      [
        indicator.id, indicator.name, indicator.light, indicator.tier,
        indicator.weight, indicator.direction, indicator.thresholds_json,
        indicator.cadence, indicator.category, indicator.description, indicator.caveat,
      ]
    );
  } else {
    const db = getSqlite();
    db.prepare(
      `INSERT INTO indicators (id, name, light, tier, weight, direction, thresholds_json, cadence, category, description, caveat)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name,
         light = excluded.light,
         tier = excluded.tier,
         weight = excluded.weight,
         direction = excluded.direction,
         thresholds_json = excluded.thresholds_json,
         cadence = excluded.cadence,
         category = excluded.category,
         description = excluded.description,
         caveat = excluded.caveat`
    ).run(
      indicator.id, indicator.name, indicator.light, indicator.tier,
      indicator.weight, indicator.direction, indicator.thresholds_json,
      indicator.cadence, indicator.category, indicator.description, indicator.caveat
    );
  }
}

export async function getAllIndicatorMeta(): Promise<DbIndicator[]> {
  if (isProduction) {
    const db = getPool();
    const res = await db.query('SELECT * FROM indicators ORDER BY category, id');
    return res.rows;
  } else {
    const db = getSqlite();
    return db.prepare('SELECT * FROM indicators ORDER BY category, id').all() as DbIndicator[];
  }
}

// ─── Readings ────────────────────────────────────────────────────────────────

export async function upsertReading(reading: Omit<DbReading, 'id' | 'fetched_at'>): Promise<void> {
  const asOfStr = reading.as_of.toISOString();
  if (isProduction) {
    const db = getPool();
    await db.query(
      `INSERT INTO readings (indicator_id, raw_value, sub_score, state, trend, as_of, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (indicator_id, as_of) DO UPDATE SET
         raw_value = EXCLUDED.raw_value,
         sub_score = EXCLUDED.sub_score,
         state = EXCLUDED.state,
         trend = EXCLUDED.trend,
         source = EXCLUDED.source,
         fetched_at = NOW()`,
      [
        reading.indicator_id, reading.raw_value, reading.sub_score,
        reading.state, reading.trend, reading.as_of, reading.source,
      ]
    );
  } else {
    const db = getSqlite();
    db.prepare(
      `INSERT INTO readings (indicator_id, raw_value, sub_score, state, trend, as_of, source)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (indicator_id, as_of) DO UPDATE SET
         raw_value = excluded.raw_value,
         sub_score = excluded.sub_score,
         state = excluded.state,
         trend = excluded.trend,
         source = excluded.source,
         fetched_at = datetime('now')`
    ).run(
      reading.indicator_id, reading.raw_value, reading.sub_score,
      reading.state, reading.trend, asOfStr, reading.source
    );
  }
}

export async function getLatestReading(indicatorId: string): Promise<DbReading | null> {
  if (isProduction) {
    const db = getPool();
    const res = await db.query(
      'SELECT * FROM readings WHERE indicator_id = $1 ORDER BY as_of DESC LIMIT 1',
      [indicatorId]
    );
    return res.rows[0] ?? null;
  } else {
    const db = getSqlite();
    const row = db.prepare('SELECT * FROM readings WHERE indicator_id = ? ORDER BY as_of DESC LIMIT 1').get(indicatorId) as any;
    if (!row) return null;
    return { ...row, as_of: normalizeDate(row.as_of), fetched_at: normalizeDate(row.fetched_at) };
  }
}

export async function getAllLatestReadings(): Promise<DbReading[]> {
  if (isProduction) {
    const db = getPool();
    const res = await db.query(
      `SELECT DISTINCT ON (indicator_id)
         id, indicator_id, raw_value, sub_score, state, trend, as_of, source, fetched_at
       FROM readings
       ORDER BY indicator_id, as_of DESC`
    );
    return res.rows;
  } else {
    const db = getSqlite();
    // SQLite equivalent to SELECT DISTINCT ON
    const rows = db.prepare(
      `SELECT r1.* FROM readings r1
       INNER JOIN (
         SELECT indicator_id, MAX(as_of) as max_as_of FROM readings GROUP BY indicator_id
       ) r2 ON r1.indicator_id = r2.indicator_id AND r1.as_of = r2.max_as_of`
    ).all() as any[];
    return rows.map(r => ({ ...r, as_of: normalizeDate(r.as_of), fetched_at: normalizeDate(r.fetched_at) }));
  }
}

export async function getPriorReading(indicatorId: string): Promise<DbReading | null> {
  if (isProduction) {
    const db = getPool();
    const res = await db.query(
      'SELECT * FROM readings WHERE indicator_id = $1 ORDER BY as_of DESC LIMIT 1 OFFSET 1',
      [indicatorId]
    );
    return res.rows[0] ?? null;
  } else {
    const db = getSqlite();
    const row = db.prepare('SELECT * FROM readings WHERE indicator_id = ? ORDER BY as_of DESC LIMIT 1 OFFSET 1').get(indicatorId) as any;
    if (!row) return null;
    return { ...row, as_of: normalizeDate(row.as_of), fetched_at: normalizeDate(row.fetched_at) };
  }
}

export async function getHistory(
  indicatorId: string,
  from?: Date,
  to?: Date
): Promise<DbReading[]> {
  if (isProduction) {
    const db = getPool();
    let query = 'SELECT * FROM readings WHERE indicator_id = $1';
    const params: (string | Date)[] = [indicatorId];
    
    if (from) { params.push(from); query += ` AND as_of >= $${params.length}`; }
    if (to) { params.push(to); query += ` AND as_of <= $${params.length}`; }
    query += ' ORDER BY as_of ASC';
    
    const res = await db.query(query, params);
    return res.rows;
  } else {
    const db = getSqlite();
    let query = 'SELECT * FROM readings WHERE indicator_id = ?';
    const params: unknown[] = [indicatorId];

    if (from) { params.push(from.toISOString()); query += ` AND as_of >= ?`; }
    if (to) { params.push(to.toISOString()); query += ` AND as_of <= ?`; }
    query += ' ORDER BY as_of ASC';

    const rows = db.prepare(query).all(params) as any[];
    return rows.map(r => ({ ...r, as_of: normalizeDate(r.as_of), fetched_at: normalizeDate(r.fetched_at) }));
  }
}

// ─── Manual Ledger ───────────────────────────────────────────────────────────

export async function insertManualEntry(
  indicatorId: string,
  payload: Record<string, unknown>,
  enteredBy: string,
  note?: string
): Promise<void> {
  if (isProduction) {
    const db = getPool();
    await db.query(
      `INSERT INTO manual_ledger (indicator_id, payload_json, entered_by, note)
       VALUES ($1,$2,$3,$4)`,
      [indicatorId, JSON.stringify(payload), enteredBy, note ?? null]
    );
  } else {
    const db = getSqlite();
    db.prepare(
      `INSERT INTO manual_ledger (indicator_id, payload_json, entered_by, note)
       VALUES (?,?,?,?)`
    ).run(indicatorId, JSON.stringify(payload), enteredBy, note ?? null);
  }
}

export async function getLatestManualEntry(
  indicatorId: string
): Promise<{ payload: Record<string, unknown>; entered_at: Date } | null> {
  if (isProduction) {
    const db = getPool();
    const res = await db.query(
      'SELECT payload_json, entered_at FROM manual_ledger WHERE indicator_id = $1 ORDER BY entered_at DESC LIMIT 1',
      [indicatorId]
    );
    if (!res.rows[0]) return null;
    return { payload: JSON.parse(res.rows[0].payload_json), entered_at: res.rows[0].entered_at };
  } else {
    const db = getSqlite();
    const row = db.prepare('SELECT payload_json, entered_at FROM manual_ledger WHERE indicator_id = ? ORDER BY entered_at DESC LIMIT 1').get(indicatorId) as any;
    if (!row) return null;
    return { payload: JSON.parse(row.payload_json), entered_at: normalizeDate(row.entered_at) };
  }
}

export async function getAllManualEntries(indicatorId: string): Promise<unknown[]> {
  if (isProduction) {
    const db = getPool();
    const res = await db.query(
      'SELECT * FROM manual_ledger WHERE indicator_id = $1 ORDER BY entered_at DESC',
      [indicatorId]
    );
    return res.rows;
  } else {
    const db = getSqlite();
    const rows = db.prepare('SELECT * FROM manual_ledger WHERE indicator_id = ? ORDER BY entered_at DESC').all(indicatorId) as any[];
    return rows.map(r => ({ ...r, entered_at: normalizeDate(r.entered_at) }));
  }
}

// ─── Job Runs ────────────────────────────────────────────────────────────────

export async function logJobRun(
  adapter: string,
  status: 'success' | 'error' | 'partial',
  message: string,
  indicatorsUpdated?: string[]
): Promise<void> {
  if (isProduction) {
    const db = getPool();
    await db.query(
      `INSERT INTO job_runs (adapter, status, message, indicators_updated) VALUES ($1,$2,$3,$4)`,
      [adapter, status, message, indicatorsUpdated ?? []]
    );
  } else {
    const db = getSqlite();
    db.prepare(
      `INSERT INTO job_runs (adapter, status, message, indicators_updated) VALUES (?,?,?,?)`
    ).run(adapter, status, message, JSON.stringify(indicatorsUpdated ?? []));
  }
}

export async function getRecentJobRuns(limit = 50): Promise<unknown[]> {
  if (isProduction) {
    const db = getPool();
    const res = await db.query(
      'SELECT * FROM job_runs ORDER BY ran_at DESC LIMIT $1',
      [limit]
    );
    return res.rows;
  } else {
    const db = getSqlite();
    const rows = db.prepare('SELECT * FROM job_runs ORDER BY ran_at DESC LIMIT ?').all(limit) as any[];
    return rows.map(r => ({ ...r, ran_at: normalizeDate(r.ran_at) }));
  }
}

export async function getLastJobRun(adapter: string): Promise<{ status: string; ran_at: Date } | null> {
  const pattern = `${adapter}%`;
  if (isProduction) {
    const db = getPool();
    const res = await db.query(
      'SELECT status, ran_at FROM job_runs WHERE adapter LIKE $1 ORDER BY ran_at DESC LIMIT 1',
      [pattern]
    );
    return res.rows[0] ?? null;
  } else {
    const db = getSqlite();
    const row = db.prepare('SELECT status, ran_at FROM job_runs WHERE adapter LIKE ? ORDER BY ran_at DESC LIMIT 1').get(pattern) as any;
    if (!row) return null;
    return { status: row.status, ran_at: normalizeDate(row.ran_at) };
  }
}

// ─── Alert Log ───────────────────────────────────────────────────────────────

export async function logAlert(
  indicatorId: string,
  fromState: string | null,
  toState: string,
  emailTo: string
): Promise<void> {
  if (isProduction) {
    const db = getPool();
    await db.query(
      `INSERT INTO alert_log (indicator_id, from_state, to_state, email_to) VALUES ($1,$2,$3,$4)`,
      [indicatorId, fromState, toState, emailTo]
    );
  } else {
    const db = getSqlite();
    db.prepare(
      `INSERT INTO alert_log (indicator_id, from_state, to_state, email_to) VALUES (?,?,?,?)`
    ).run(indicatorId, fromState, toState, emailTo);
  }
}

// ─── C3 Pending Entries (HITL Review Queue) ───────────────────────────────────

export interface PendingC3Entry {
  parties: string;
  dealType: string;
  estimatedAmountBn: number | null;
  dealDate: string | null;
  draftNote: string | null;
  sourceUrl: string | null;
  confidence: string;
}

export async function insertPendingC3Entry(entry: PendingC3Entry): Promise<void> {
  if (isProduction) {
    const db = getPool();
    await db.query(
      `INSERT INTO pending_c3_entries
         (parties, deal_type, estimated_amount_bn, deal_date, draft_note, source_url, confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING`,
      [entry.parties, entry.dealType, entry.estimatedAmountBn,
       entry.dealDate, entry.draftNote, entry.sourceUrl, entry.confidence]
    );
  } else {
    const db = getSqlite();
    db.prepare(
      `INSERT OR IGNORE INTO pending_c3_entries
         (parties, deal_type, estimated_amount_bn, deal_date, draft_note, source_url, confidence)
       VALUES (?,?,?,?,?,?,?)`
    ).run(entry.parties, entry.dealType, entry.estimatedAmountBn ?? null,
          entry.dealDate ?? null, entry.draftNote ?? null,
          entry.sourceUrl ?? null, entry.confidence);
  }
}

export async function getPendingC3Entries(): Promise<unknown[]> {
  if (isProduction) {
    const db = getPool();
    const res = await db.query(
      `SELECT * FROM pending_c3_entries WHERE status = 'pending' ORDER BY created_at DESC`
    );
    return res.rows;
  } else {
    const db = getSqlite();
    return db.prepare(
      `SELECT * FROM pending_c3_entries WHERE status = 'pending' ORDER BY created_at DESC`
    ).all();
  }
}

export async function approveC3Entry(id: number): Promise<void> {
  const now = new Date().toISOString();
  if (isProduction) {
    const db = getPool();
    await db.query(
      `UPDATE pending_c3_entries SET status='approved', reviewed_by='admin', reviewed_at=$1 WHERE id=$2`,
      [now, id]
    );
  } else {
    const db = getSqlite();
    db.prepare(
      `UPDATE pending_c3_entries SET status='approved', reviewed_by='admin', reviewed_at=? WHERE id=?`
    ).run(now, id);
  }
}

export async function rejectC3Entry(id: number): Promise<void> {
  const now = new Date().toISOString();
  if (isProduction) {
    const db = getPool();
    await db.query(
      `UPDATE pending_c3_entries SET status='rejected', reviewed_by='admin', reviewed_at=$1 WHERE id=$2`,
      [now, id]
    );
  } else {
    const db = getSqlite();
    db.prepare(
      `UPDATE pending_c3_entries SET status='rejected', reviewed_by='admin', reviewed_at=? WHERE id=?`
    ).run(now, id);
  }
}

export async function seedBaselineManualEntriesIfEmpty(): Promise<void> {
  let count = 0;
  if (isProduction) {
    const db = getPool();
    const res = await db.query('SELECT COUNT(*)::int as count FROM manual_ledger');
    count = res.rows[0]?.count ?? 0;
  } else {
    const db = getSqlite();
    const row = db.prepare('SELECT COUNT(*) as count FROM manual_ledger').get() as any;
    count = row?.count ?? 0;
  }

  if (count === 0) {
    console.log('[DB] Seeding baseline manual entries for G1, G3, G4...');
    await insertManualEntry('G1', {
      adoptionPct: 18.5,
      surveyName: 'McKinsey Enterprise AI Survey',
    }, 'seed', 'Baseline G1 survey data');

    await insertManualEntry('G3', {
      top4SharePct: 62.5,
      sourceName: 'Analyst estimates',
    }, 'seed', 'Baseline G3 Nvidia customer concentration estimate');

    await insertManualEntry('G4', {
      costTrend: 'falling',
      marginTrend: 'up',
      nvidiaGrossMarginPct: 78.4,
    }, 'seed', 'Baseline G4 cost and margin trend');
  }
}


