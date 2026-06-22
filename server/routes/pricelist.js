import express from 'express';
import db from '../db/db.js';

const router = express.Router();

// List products. ?all=1 includes soft-deleted.
router.get('/', (req, res) => {
  const includeInactive = req.query.all === '1';
  const rows = db
    .prepare(`SELECT * FROM products ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY category, code`)
    .all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { code, name, category, unit, default_supply_rate, default_install_rate, notes } = req.body || {};
  if (!name || !category) return res.status(400).json({ error: 'name and category are required' });
  const info = db
    .prepare(
      `INSERT INTO products (code, name, category, unit, default_supply_rate, default_install_rate, notes, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      code || '',
      name,
      category,
      unit || 'm2',
      num(default_supply_rate),
      num(default_install_rate),
      notes || ''
    );
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  db.prepare(
    `UPDATE products SET code=?, name=?, category=?, unit=?, default_supply_rate=?, default_install_rate=?, notes=?, active=?
     WHERE id=?`
  ).run(
    b.code ?? existing.code,
    b.name ?? existing.name,
    b.category ?? existing.category,
    b.unit ?? existing.unit,
    b.default_supply_rate != null ? num(b.default_supply_rate) : existing.default_supply_rate,
    b.default_install_rate != null ? num(b.default_install_rate) : existing.default_install_rate,
    b.notes ?? existing.notes,
    b.active != null ? (b.active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

// Soft-delete (active = 0). ?hard=1 removes the row.
router.delete('/:id', (req, res) => {
  if (req.query.hard === '1') {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  } else {
    db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

export default router;
