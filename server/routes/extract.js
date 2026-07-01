import express from 'express';
import multer from 'multer';
import db from '../db/db.js';
import { readConfig } from '../lib/config.js';
import { streamExtraction, pdfBlock } from '../lib/anthropic.js';
import {
  buildAddressCheckInstructions,
  buildEnergyInstructions,
  buildPlansInstructions,
  buildProjectPreviewInstructions,
  parseExtraction,
} from '../lib/extractionPrompt.js';
import { matchBuilder } from '../lib/fuzzyMatch.js';
import { compareAddresses } from '../lib/addressMatch.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/extract/check-address  (multipart: plans=<pdf> energyReport=<pdf>)
// Cheap pre-check run before the full pipeline: does the site address on the
// plans match the one on the energy report? Lets the UI flag a probable
// wrong-file-pair upload before burning the expensive extraction pass on it.
router.post(
  '/check-address',
  upload.fields([
    { name: 'plans', maxCount: 1 },
    { name: 'energyReport', maxCount: 1 },
  ]),
  async (req, res) => {
    const plans = req.files?.plans?.[0];
    const energy = req.files?.energyReport?.[0];
    if (!plans || !energy) {
      return res.status(400).json({ error: 'Both a plans PDF and an energyReport PDF are required.' });
    }

    const { apiKey, energyModel } = readConfig();
    if (!apiKey) return res.status(400).json({ error: 'No Anthropic API key configured. Add one in Settings.', code: 'NO_API_KEY' });

    try {
      const [plansRun, energyRun] = await Promise.all([
        streamExtraction({
          content: [pdfBlock(plans.buffer.toString('base64'), 'Architectural plans'), { type: 'text', text: buildAddressCheckInstructions('plans') }],
          model: energyModel,
          maxTokens: 500,
        }),
        streamExtraction({
          content: [pdfBlock(energy.buffer.toString('base64'), 'Energy report'), { type: 'text', text: buildAddressCheckInstructions('energy_report') }],
          model: energyModel,
          maxTokens: 500,
        }),
      ]);

      const plansInfo = parseExtraction(plansRun.text);
      const energyInfo = parseExtraction(energyRun.text);
      const cmp = compareAddresses(plansInfo.address, energyInfo.address);

      res.json({
        plans: { address: plansInfo.address, confidence: plansInfo.confidence },
        energyReport: { address: energyInfo.address, confidence: energyInfo.confidence },
        status: cmp.status,
        score: cmp.score,
      });
    } catch (e) {
      const code = e.status === 401 ? 'BAD_KEY' : e.code || undefined;
      const msg = e.status === 401 ? 'Anthropic rejected the API key (401).' : `Address check failed: ${e.message}`;
      res.status(500).json({ error: msg, code });
    }
  }
);

// POST /api/extract  (multipart: plans=<pdf> [energyReport=<pdf>])
// Streams newline-delimited JSON progress events, then a final {type:'done'}.
// Event types: stage | progress | note | done | error.
router.post(
  '/',
  upload.fields([
    { name: 'plans', maxCount: 1 },
    { name: 'energyReport', maxCount: 1 },
  ]),
  async (req, res) => {
    const plans = req.files?.plans?.[0];
    const energy = req.files?.energyReport?.[0];
    if (!plans) return res.status(400).json({ error: 'A plans PDF is required (field "plans").' });

    // Fail fast (with a normal status) before switching to the stream.
    const { apiKey, model, energyModel } = readConfig();
    if (!apiKey) return res.status(400).json({ error: 'No Anthropic API key configured. Add one in Settings.', code: 'NO_API_KEY' });

    // Switch the response into a streaming NDJSON channel.
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    const send = (obj) => res.write(JSON.stringify(obj) + '\n');

    // Throttled progress: report accumulated characters as text streams in.
    const makeProgress = (stage) => {
      let chars = 0;
      let last = 0;
      return (chunk) => {
        chars += chunk.length;
        const now = Date.now();
        if (now - last > 350) {
          last = now;
          send({ type: 'progress', stage, chars });
        }
      };
    };

    try {
      let energyReport = null;
      let projectPreview = null;

      // ---- PASS 0: project preview (fast feedback for the loading screen) ----
      send({ type: 'stage', stage: 'project', label: 'Finding the project details…', model: energyModel });
      const onTextProject = makeProgress('project');
      try {
        const { text } = await streamExtraction({
          content: [
            pdfBlock(plans.buffer.toString('base64'), 'Architectural plans', true),
            { type: 'text', text: buildProjectPreviewInstructions() },
          ],
          model: energyModel,
          maxTokens: 2000,
          onText: onTextProject,
        });
        projectPreview = parseExtraction(text);
        send({ type: 'preview', stage: 'project', project: projectPreview });
      } catch {
        send({ type: 'note', stage: 'project', level: 'warn', message: 'Could not read the title block quickly; continuing with full extraction.' });
      }

      // ---- PASS A: energy report (focused, faster model) ----
      if (energy) {
        send({ type: 'stage', stage: 'energy', label: 'Reading the energy report…', model: energyModel });
        const onText = makeProgress('energy');
        const { text } = await streamExtraction({
          content: [pdfBlock(energy.buffer.toString('base64'), 'Energy report', true), { type: 'text', text: buildEnergyInstructions() }],
          model: energyModel,
          maxTokens: 4000,
          onText,
        });
        try {
          energyReport = parseExtraction(text);
          send({ type: 'preview', stage: 'energy', energyReport });
          send({ type: 'note', stage: 'energy', message: `Distilled ${energyReport?.requirements?.length || 0} insulation requirement(s) from the report.` });
        } catch {
          // Degrade gracefully — proceed as plans-only, but flag it.
          energyReport = null;
          send({ type: 'note', stage: 'energy', level: 'warn', message: 'Could not parse the energy report; continuing with plans only.' });
        }
      }

      // ---- PASS B: plans / geometry (main model) ----
      send({ type: 'stage', stage: 'plans', label: 'Reading the plans & measuring up…', model });
      const onTextB = makeProgress('plans');
      const { text: plansText } = await streamExtraction({
        content: [
          pdfBlock(plans.buffer.toString('base64'), 'Architectural plans', true),
          { type: 'text', text: buildPlansInstructions({ energyRequirements: energyReport?.requirements || null }) },
        ],
        model,
        maxTokens: 16000,
        onText: onTextB,
      });

      let takeoff;
      try {
        takeoff = parseExtraction(plansText);
      } catch (e) {
        send({ type: 'error', code: 'BAD_JSON', error: e.message, raw: e.raw });
        return res.end();
      }
      send({
        type: 'preview',
        stage: 'plans',
        plansSummary: {
          externalWalls: takeoff.walls_external?.length || 0,
          doors: takeoff.openings?.doors?.length || 0,
          gables: takeoff.gables?.length || 0,
          garageInternal: takeoff.garage_internal_walls?.length || 0,
          ceilings: takeoff.ceilings?.length || 0,
          flags: takeoff.flags?.length || 0,
          assumptions: takeoff.assumptions?.length || 0,
        },
      });

      if (projectPreview) {
        const fullProject = takeoff.project || {};
        takeoff.project = {
          ...projectPreview,
          ...fullProject,
          address: fullProject.address || projectPreview.address || null,
          lot: fullProject.lot || projectPreview.lot || null,
          plan_number: fullProject.plan_number || projectPreview.plan_number || null,
          builder: fullProject.builder || projectPreview.builder || null,
          designer: fullProject.designer || projectPreview.designer || null,
          client: fullProject.client || projectPreview.client || null,
          drawing_revision: fullProject.drawing_revision || projectPreview.drawing_revision || null,
          drawing_number: fullProject.drawing_number || projectPreview.drawing_number || null,
          address_source: fullProject.address_source || projectPreview.address_source || 'missing',
          confidence: fullProject.confidence || projectPreview.confidence || 'medium',
        };
      }

      // Merge the distilled energy report back in (Pass A is the source of truth for
      // it), but keep any plans-vs-report conflicts Pass B still surfaced rather than
      // dropping them when its energy_report object gets replaced wholesale.
      if (energyReport) {
        const plansConflicts = takeoff.energy_report?.conflicts || [];
        takeoff.energy_report = {
          present: true,
          ...energyReport,
          conflicts: [...(energyReport.conflicts || []), ...plansConflicts],
        };
      } else {
        takeoff.energy_report = takeoff.energy_report || { present: Boolean(energy) };
        if (!energy) takeoff.energy_report.present = false;
        if (energy && energyReport === null) {
          takeoff.flags = takeoff.flags || [];
          takeoff.flags.push({ severity: 'warn', message: 'Energy report supplied but could not be parsed; treated as plans-only.', location: 'global' });
        }
      }

      const builders = db.prepare('SELECT * FROM builders').all();
      const match = matchBuilder(takeoff.project?.builder, builders);

      send({
        type: 'done',
        result: {
          takeoff,
          builderMatch: match
            ? { matched: true, score: match.score, reason: match.reason, builderId: match.builder.id, builderName: match.builder.name }
            : { matched: false },
          files: {
            plans: { name: plans.originalname, size: plans.size },
            energyReport: energy ? { name: energy.originalname, size: energy.size } : null,
          },
        },
      });
      res.end();
    } catch (e) {
      const code = e.status === 401 ? 'BAD_KEY' : e.code || undefined;
      const msg = e.status === 401 ? 'Anthropic rejected the API key (401).' : `Anthropic call failed: ${e.message}`;
      try {
        send({ type: 'error', code, error: msg });
        res.end();
      } catch {
        // response already torn down
      }
    }
  }
);

export default router;
