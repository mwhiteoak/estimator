// Reads/writes the local config.json (gitignored). Source of truth for the
// Anthropic API key, model, and currency. Falls back to env for the key so a
// dev can `ANTHROPIC_API_KEY=... npm start` without touching the file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const DEFAULTS = {
  apiKey: '',
  model: 'claude-opus-4-8',
  // Faster model for the focused energy-report distillation pass (Pass A).
  // Long NatHERS/BERS reports don't need the top-tier geometry model.
  energyModel: 'claude-sonnet-4-6',
  currency: 'AUD',
};

export function readConfig() {
  let onDisk = {};
  try {
    onDisk = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    onDisk = {};
  }
  const cfg = { ...DEFAULTS, ...onDisk };
  // Env var wins only when no key is stored on disk.
  if (!cfg.apiKey && process.env.ANTHROPIC_API_KEY) {
    cfg.apiKey = process.env.ANTHROPIC_API_KEY;
  }
  return cfg;
}

export function writeConfig(patch) {
  let onDisk = {};
  try {
    onDisk = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    onDisk = {};
  }
  const next = { ...DEFAULTS, ...onDisk, ...patch };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

// Never leak the raw key to the frontend — return a masked confirmation.
export function maskedConfig() {
  const cfg = readConfig();
  const key = cfg.apiKey || '';
  return {
    hasApiKey: Boolean(key),
    apiKeyLast4: key ? key.slice(-4) : '',
    apiKeySource: cfg.apiKey && !readRawDiskKey() && process.env.ANTHROPIC_API_KEY ? 'env' : 'config',
    model: cfg.model,
    energyModel: cfg.energyModel,
    currency: cfg.currency,
  };
}

function readRawDiskKey() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).apiKey || '';
  } catch {
    return '';
  }
}

export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (most capable — best for reading drawings)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (faster / cheaper)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (cheapest)' },
];
