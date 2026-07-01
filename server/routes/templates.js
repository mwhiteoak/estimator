import express from 'express';
import db from '../db/db.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, name, builder, created_at FROM templates ORDER BY created_at DESC').all());
});

router.get('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json({ ...t, takeoff: safeParse(t.takeoff_json) });
});

router.post('/', (req, res) => {
  const { name, builder, takeoff } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!takeoff) return res.status(400).json({ error: 'takeoff is required' });
  const info = db
    .prepare('INSERT INTO templates (name, builder, takeoff_json) VALUES (?, ?, ?)')
    .run(name, builder || '', JSON.stringify(takeoff));
  res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
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
