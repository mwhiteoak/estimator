-- =====================================================================
-- Insulation Take-Off App — database schema
-- =====================================================================

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  code TEXT,                 -- e.g. 'WALL_R2.0'
  name TEXT,                 -- 'R2.0 wall batts'
  category TEXT,             -- 'external_wall' | 'ceiling' | 'roof_sarking' | 'special_wall' | ...
  unit TEXT DEFAULT 'm2',
  default_supply_rate REAL,  -- $ / m2
  default_install_rate REAL, -- $ / m2 (allow 0 if supply-only)
  wastage_pct REAL DEFAULT 0,-- % extra material ordered for cuts/offcuts (supply qty only, not install)
  notes TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS builders (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE,          -- 'Avia Homes', 'Hancock Homes'
  aliases TEXT,              -- JSON array for fuzzy matching variants
  notes TEXT
);

CREATE TABLE IF NOT EXISTS builder_rates (
  builder_id INTEGER REFERENCES builders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  supply_rate REAL,          -- override of default
  install_rate REAL,
  PRIMARY KEY (builder_id, product_id)
);

-- Saved jobs: the structured (edited) take-off JSON + chosen rates + computed totals,
-- so a job can be reopened and re-exported without re-running the AI.
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  name TEXT,                 -- display name (address or drawing no)
  address TEXT,
  builder TEXT,
  takeoff_json TEXT,         -- the edited extraction JSON
  pricing_json TEXT,         -- chosen pricing mode + per-line rate overrides
  totals_json TEXT,          -- last computed totals snapshot
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
