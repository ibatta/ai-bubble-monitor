-- AI Bubble Pressure Monitor — PostgreSQL Schema

CREATE TABLE IF NOT EXISTS indicators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  light TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('auto', 'semi', 'manual', 'hitl')),
  weight REAL NOT NULL DEFAULT 1.0,
  direction TEXT NOT NULL CHECK (direction IN ('higher_is_risk', 'lower_is_risk')),
  thresholds_json TEXT NOT NULL,
  cadence TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('warning', 'allclear', 'context')),
  description TEXT,
  caveat TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS readings (
  id SERIAL PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id),
  raw_value REAL,
  sub_score REAL NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('green', 'amber', 'red', 'unknown')),
  trend TEXT NOT NULL CHECK (trend IN ('up', 'flat', 'down', 'unknown')),
  as_of TIMESTAMP NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (indicator_id, as_of)
);

CREATE TABLE IF NOT EXISTS manual_ledger (
  id SERIAL PRIMARY KEY,
  indicator_id TEXT NOT NULL REFERENCES indicators(id),
  payload_json TEXT NOT NULL,
  entered_by TEXT NOT NULL DEFAULT 'admin',
  entered_at TIMESTAMP DEFAULT NOW(),
  note TEXT
);

CREATE TABLE IF NOT EXISTS job_runs (
  id SERIAL PRIMARY KEY,
  adapter TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
  message TEXT,
  indicators_updated TEXT[],
  ran_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_log (
  id SERIAL PRIMARY KEY,
  indicator_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW(),
  email_to TEXT
);

-- C3 Human-in-the-Loop review queue
-- Auto-drafted entries from the news classifier, awaiting admin approval
CREATE TABLE IF NOT EXISTS pending_c3_entries (
  id SERIAL PRIMARY KEY,
  parties TEXT NOT NULL,
  deal_type TEXT NOT NULL DEFAULT 'other',
  estimated_amount_bn REAL,
  deal_date TEXT,
  draft_note TEXT,
  source_url TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_readings_indicator_id ON readings(indicator_id);
CREATE INDEX IF NOT EXISTS idx_readings_as_of ON readings(as_of DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_adapter ON job_runs(adapter);
CREATE INDEX IF NOT EXISTS idx_job_runs_ran_at ON job_runs(ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_c3_status ON pending_c3_entries(status);
