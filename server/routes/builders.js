import express from 'express';
import db from '../db/db.js';
import { matchBuilder } from '../lib/fuzzyMatch.js';

const router = express.Router();

function builderWithRates(id) {
  const builder = db.prepare('SELECT * FROM builders WHERE id = ?').get(id);
  if (!builder) return null;
  const rates = db.prepare('SELECT * FROM builder_rates WHERE builder_id = ?').all(id);
  return { ...builder, rates };
}

router.get('/', (req, res) => {
  const builders = db.prepare('SELECT * FROM builders ORDER BY name').all();
  res.json(builders.map((b) => builderWithRates(b.id)));
});

// Fuzzy-match an extracted builder name. ?name=...
router.get('/match', (req, res) => {
  const builders = db.prepare('SELECT * FROM builders').all();
  const match = matchBuilder(req.query.name || '', builders);
  if (!match) return res.json({ matched: false });
  res.json({
    matched: true,
    score: match.score,
    reason: match.reason,
    matchedOn: match.matchedOn,
    builder: builderWithRates(match.builder.id),
  });
});

router.post('/', (req, res) => {
  const { name, aliases, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const aliasesJson = Array.isArray(aliases) ? JSON.stringify(aliases) : aliases || '[]';
  try {
    const info = db
      .prepare('INSERT INTO builders (name, aliases, notes) VALUES (?, ?, ?)')
      .run(name, aliasesJson, notes || '');
    res.json(builderWithRates(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM builders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const aliasesJson =
    b.aliases == null ? existing.aliases : Array.isArray(b.aliases) ? JSON.stringify(b.aliases) : b.aliases;
  db.prepare('UPDATE builders SET name=?, aliases=?, notes=? WHERE id=?').run(
    b.name ?? existing.name,
    aliasesJson,
    b.notes ?? existing.notes,
    req.params.id
  );
  res.json(builderWithRates(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM builders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Upsert / clear a builder's per-product rate override. Either field may be
// omitted to leave it untouched (e.g. editing just the supply rate doesn't
// pin the install rate to whatever the default happens to be right now).
router.put('/:id/rates/:productId', (req, res) => {
  const { supply_rate, install_rate } = req.body || {};
  const existing = db
    .prepare('SELECT * FROM builder_rates WHERE builder_id = ? AND product_id = ?')
    .get(req.params.id, req.params.productId);
  const nextSupply = supply_rate !== undefined ? num(supply_rate) : existing?.supply_rate ?? null;
  const nextInstall = install_rate !== undefined ? num(install_rate) : existing?.install_rate ?? null;
  db.prepare(
    `INSERT INTO builder_rates (builder_id, product_id, supply_rate, install_rate)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(builder_id, product_id) DO UPDATE SET supply_rate=excluded.supply_rate, install_rate=excluded.install_rate`
  ).run(req.params.id, req.params.productId, nextSupply, nextInstall);
  res.json(builderWithRates(req.params.id));
});

router.delete('/:id/rates/:productId', (req, res) => {
  db.prepare('DELETE FROM builder_rates WHERE builder_id = ? AND product_id = ?').run(
    req.params.id,
    req.params.productId
  );
  res.json(builderWithRates(req.params.id));
});

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

export default router;
