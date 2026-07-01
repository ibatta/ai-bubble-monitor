import { Pool } from 'pg';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;
let sqliteDb: Database.Database | null = null;

export const isProduction = process.env.NODE_ENV === 'production';

export function getPool(): Pool {
  if (!isProduction) {
    throw new Error('Postgres pool requested in local SQLite mode');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export function getSqlite(): Database.Database {
  if (!sqliteDb) {
    const dbPath = path.join(__dirname, '../../ai_bubble.db');
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
  }
  return sqliteDb;
}

export async function runMigration(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');
  let schema = fs.readFileSync(schemaPath, 'utf-8');

  if (isProduction) {
    const db = getPool();
    try {
      await db.query(schema);
      console.log('[DB] Postgres schema migration completed');
    } catch (err) {
      console.error('[DB] Postgres migration failed:', err);
      throw err;
    }
  } else {
    // SQLite compatible syntax tweaks from PostgreSQL
    schema = schema
      .replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/TIMESTAMP/g, 'DATETIME')
      .replace(/DEFAULT NOW\(\)/g, 'DEFAULT CURRENT_TIMESTAMP')
      .replace(/DEFAULT NOW/g, 'DEFAULT CURRENT_TIMESTAMP')
      .replace(/TEXT\[\]/g, 'TEXT') // SQLite doesn't have arrays, save as JSON string
      .replace(/ON CONFLICT \(([^)]+)\) DO UPDATE SET/g, 'ON CONFLICT ($1) DO UPDATE SET');

    const db = getSqlite();
    try {
      db.exec(schema);
      console.log('[DB] SQLite schema migration completed');
    } catch (err) {
      console.error('[DB] SQLite migration failed:', err);
      throw err;
    }
  }
}
