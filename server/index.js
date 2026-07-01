// Express app: serves the built frontend + the /api surface. Holds the API key
// server-side and talks to Anthropic. Local, single-user.
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import settings from './routes/settings.js';
import pricelist from './routes/pricelist.js';
import builders from './routes/builders.js';
import extract from './routes/extract.js';
import takeoff from './routes/takeoff.js';
import exportRoute from './routes/export.js';
import jobs from './routes/jobs.js';
import templates from './routes/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5174;

app.use(cors()); // local dev: Vite proxy also covers this
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/settings', settings);
app.use('/api/products', pricelist);
app.use('/api/builders', builders);
app.use('/api/extract', extract);
app.use('/api/takeoff', takeoff);
app.use('/api/export', exportRoute);
app.use('/api/jobs', jobs);
app.use('/api/templates', templates);

// Serve the built client if present (production / single-process mode).
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[insulation-takeoff] server on http://localhost:${PORT}`);
  console.log(`[insulation-takeoff] health: http://localhost:${PORT}/api/health`);
});
