import express from 'express';
import db from '../db/db.js';
import { computeTakeoff } from '../lib/compute.js';
import { buildWorkbook, safeFilename } from '../lib/excel.js';

const router = express.Router();

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
  return { mode, products, builderRates, lineOverrides: pricing.lineOverrides || {} };
}

// POST /api/export  { takeoff, pricing? }  -> .xlsx download
router.post('/', async (req, res) => {
  try {
    const { takeoff, pricing } = req.body || {};
    if (!takeoff) return res.status(400).json({ error: 'takeoff JSON is required' });

    const result = computeTakeoff(takeoff, { pricing: buildPriceContext(pricing) });

    // Filename: address, else drawing/job no (+ a flag handled on Assumptions tab).
    const p = result.project || {};
    let base = p.address;
    if (!base || (p.address_source && p.address_source === 'missing')) {
      base = p.drawing_number || p.drawing_revision || 'Drawing';
    }
    const filename = `${safeFilename(base)} - Insulation Take-Off.xlsx`;

    const wb = await buildWorkbook(result);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Filename', filename);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
