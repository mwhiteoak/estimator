import express from 'express';
import db from '../db/db.js';
import { computeTakeoff } from '../lib/compute.js';

const router = express.Router();

// Build the price context (products + resolved builder rate map) for compute.
function buildPriceContext(pricing) {
  const mode = pricing?.mode || 'none';
  if (mode === 'none') return { mode };
  const products = db.prepare('SELECT * FROM products WHERE active = 1').all();
  let builderRates = null;
  if (mode === 'auto' && pricing.builderId) {
    builderRates = {};
    const rows = db.prepare('SELECT * FROM builder_rates WHERE builder_id = ?').all(pricing.builderId);
    for (const r of rows) builderRates[r.product_id] = { supply_rate: r.supply_rate, install_rate: r.install_rate };
  }
  return {
    mode,
    products,
    builderRates,
    lineOverrides: pricing.lineOverrides || {},
  };
}

// POST /api/takeoff  { takeoff, pricing? }  -> computed measurements (+ quote)
router.post('/', (req, res) => {
  try {
    const { takeoff, pricing } = req.body || {};
    if (!takeoff) return res.status(400).json({ error: 'takeoff JSON is required' });
    const priceContext = buildPriceContext(pricing);
    const result = computeTakeoff(takeoff, { pricing: priceContext });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
