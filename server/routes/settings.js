import express from 'express';
import { maskedConfig, writeConfig, AVAILABLE_MODELS } from '../lib/config.js';

const router = express.Router();

// Masked view — never returns the raw key.
router.get('/', (req, res) => {
  res.json({ ...maskedConfig(), availableModels: AVAILABLE_MODELS });
});

router.post('/', (req, res) => {
  const patch = {};
  const { apiKey, model, energyModel, currency } = req.body || {};
  if (typeof apiKey === 'string' && apiKey.trim()) patch.apiKey = apiKey.trim();
  if (model) patch.model = model;
  if (energyModel) patch.energyModel = energyModel;
  if (currency) patch.currency = currency;
  writeConfig(patch);
  res.json(maskedConfig());
});

// Explicitly clear the stored key.
router.post('/clear-key', (req, res) => {
  writeConfig({ apiKey: '' });
  res.json(maskedConfig());
});

export default router;
