import express from 'express';
import db from '../db/db.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(
    db.prepare('SELECT id, name, address, builder, created_at, updated_at FROM jobs ORDER BY updated_at DESC').all()
  );
});

router.get('/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json({
    ...job,
    takeoff: safeParse(job.takeoff_json),
    pricing: safeParse(job.pricing_json),
    totals: safeParse(job.totals_json),
  });
});

router.post('/', (req, res) => {
  const { name, address, builder, takeoff, pricing, totals } = req.body || {};
  const info = db
    .prepare(
      `INSERT INTO jobs (name, address, builder, takeoff_json, pricing_json, totals_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      name || address || 'Untitled job',
      address || '',
      builder || '',
      JSON.stringify(takeoff || {}),
      JSON.stringify(pricing || {}),
      JSON.stringify(totals || {})
    );
  res.json(db.prepare('SELECT * FROM jobs WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { name, address, builder, takeoff, pricing, totals } = req.body || {};
  db.prepare(
    `UPDATE jobs SET name=?, address=?, builder=?, takeoff_json=?, pricing_json=?, totals_json=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(
    name ?? existing.name,
    address ?? existing.address,
    builder ?? existing.builder,
    takeoff ? JSON.stringify(takeoff) : existing.takeoff_json,
    pricing ? JSON.stringify(pricing) : existing.pricing_json,
    totals ? JSON.stringify(totals) : existing.totals_json,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default router;
