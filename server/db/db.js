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

export default db;
