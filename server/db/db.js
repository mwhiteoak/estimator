// better-sqlite3 wrapper. Opens (and on first run, creates + seeds) the DB.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.TAKEOFF_DB || path.join(__dirname, 'takeoff.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Always ensure schema exists (idempotent CREATE TABLE IF NOT EXISTS).
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Seed only when the catalog is empty, so user edits are never clobbered.
const productCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
if (productCount === 0) {
  db.exec(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
  console.log('[db] Seeded price list + sample builders from seed.sql');
}

// Lightweight migration: add starter products for categories introduced after
// the initial seed, without touching a database that's already been edited.
// Insert-if-missing by code, so this is safe to run on every startup.
const NEW_DEFAULT_PRODUCTS = [
  ['WRAP_FOIL', 'Reflective foil sarking wall wrap', 'wall_wrap', 'm2', 3.2, 3.0, 'Reflective foil sarking to external framed walls'],
  ['WRAP_SUBFLOOR', 'Subfloor wrap', 'subfloor_wrap', 'm2', 3.5, 3.5, 'Vapour-permeable wrap to suspended subfloor'],
  ['SEAL_CONT', 'Continuous draught / gap sealing', 'sealant', 'lm', 2.0, 3.0, 'Continuous sealant/foam bead at specified junctions'],
];
const hasProductCode = db.prepare('SELECT 1 FROM products WHERE code = ?');
const insertProduct = db.prepare(
  `INSERT INTO products (code, name, category, unit, default_supply_rate, default_install_rate, notes, active)
   VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
);
if (productCount > 0) {
  for (const p of NEW_DEFAULT_PRODUCTS) {
    if (!hasProductCode.get(p[0])) {
      insertProduct.run(...p);
      console.log(`[db] Added new default product ${p[0]} (${p[2]})`);
    }
  }
}

export default db;
