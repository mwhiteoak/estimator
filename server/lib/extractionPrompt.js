// The extraction contract: instructions (§7) + the JSON schema the model must
// return. The model returns RAW READINGS ONLY — no arithmetic, no totals.

export const SCHEMA_EXAMPLE = {
  project: {
    address: 'string | null',
    lot: 'string | null',
    plan_number: 'string | null',
    builder: 'string | null',
    designer: 'string | null',
    client: 'string | null',
    drawing_revision: 'string | null',
    drawing_number: 'string | null',
    address_source: "'labelled' | 'scaled' | 'missing'",
    confidence: "'high' | 'medium' | 'low'",
  },
  energy_report: {
    present: 'boolean',
    standard: 'string | null',
    climate_zone: 'string | null',
    star_rating: 'string | null',
    requirements: [
      { element: 'external_wall|special_wall|ceiling|ceiling_outdoor|roof|garage_wall',
        location: 'string', r_value: 'string', build_up: 'string | null', source_page: 'number | null' },
    ],
    conflicts: [{ topic: 'string', detail: 'string' }],
  },
  walls_external: [
    { level: 'ground|first', location: 'string', material: 'brick|hebel|lightweight',
      length_m: 'number', height_m: 'number', orientation: 'N|S|E|W|NE|... | null',
      source: 'labelled|scaled|schedule', source_ref: { page: 'number | null', sheet: 'string | null', table: 'string | null', snippet: 'string | null' },
      confidence: 'high|medium|low', notes: 'string' },
  ],
  gables: [
    { level: 'ground|first', location: 'string', base_width_m: 'number', pitch_deg: 'number | null',
      gable_height_m: 'number | null', material: 'brick|hebel|lightweight',
      source: 'labelled|scaled', source_ref: { page: 'number | null', sheet: 'string | null', table: 'string | null', snippet: 'string | null' },
      confidence: 'high|medium|low', notes: 'string' },
  ],
  garage_internal_walls: [
    { location: 'string', length_m: 'number', height_m: 'number',
      openings: [{ height_m: 'number', width_m: 'number', note: 'string' }],
      source: 'labelled|scaled', source_ref: { page: 'number | null', sheet: 'string | null', table: 'string | null', snippet: 'string | null' },
      confidence: 'high|medium|low', notes: 'string' },
  ],
  openings: {
    doors: [
      { location: 'string', code: 'string | null', height_m: 'number', width_m: 'number',
        in_material: 'brick|hebel|lightweight', level: 'ground|first',
        source: 'schedule|code|scaled', source_ref: { page: 'number | null', sheet: 'string | null', table: 'string | null', snippet: 'string | null' } },
    ],
    windows: [
      { location: 'string', height_m: 'number | null', width_m: 'number | null', note: 'reference only — NOT deducted' },
    ],
  },
  ceilings: [
    { area_type: 'living|garage|alfresco|patio|porch|balcony|...', level: 'ground|first | null',
      area_m2: 'number | null', length_m: 'number | null', width_m: 'number | null',
      r_value: 'string | null', insulated: 'boolean',
      source: 'area_schedule|scaled|floor_plan', source_ref: { page: 'number | null', sheet: 'string | null', table: 'string | null', snippet: 'string | null' },
      confidence: 'high|medium|low', notes: 'string' },
  ],
  assumptions: [
    { topic: 'string', assumption: 'string', basis: 'string', confidence: 'high|medium|low' },
  ],
  flags: [
    { severity: 'info|warn|error', message: 'string', location: 'string' },
  ],
};

export function buildProjectPreviewInstructions() {
  return `You are reading architectural plans for a quick PROJECT PREVIEW only.

Extract just the title-block/site-plan details that help a user see the job has started correctly:
- address
- lot
- plan_number
- builder
- designer
- client
- drawing_revision
- drawing_number
- address_source: labelled | scaled | missing
- confidence: high | medium | low

Do not measure walls, openings, gables, or ceilings. Do not calculate anything.

Output ONLY this JSON object, no prose, no markdown fences:
${JSON.stringify(SCHEMA_EXAMPLE.project, null, 2)}`;
}

// PASS A — energy report only. Long NatHERS/BERS reports are mostly noise for a
// take-off; this focused, capped call distils just the insulation requirements
// so the expensive geometry pass never has to wade through the whole PDF.
export function buildEnergyInstructions() {
  return `You are reading ONLY an energy-efficiency report (NatHERS / BERS Pro / FirstRate / similar)
to extract the INSULATION REQUIREMENTS for a take-off.

These reports are often long and FULL OF IRRELEVANT MATERIAL. IGNORE all of it, specifically: cover
pages, certificate/assessor boilerplate, compliance statements, glazing/window schedules and U-values/
SHGC, lighting, hot water, equipment, zoning/area tables, energy-load tables, marketing, and any page
that is not about INSULATION build-up. Do not read them; do not summarise them.

Extract ONLY the insulation specification:
- climate_zone, star_rating, standard.
- every INSULATION requirement: external walls, special/boundary walls (e.g. zero-boundary fire
  batts), garage walls, ceilings, outdoor/alfresco/patio ceilings, and roof/sarking — each with its
  element, location/zone, R-value, build_up (bulk, anti-glare foil, reflective/vapour-permeable
  sarking, fire batts, wrap) and source_page.
- include a short source_ref object where possible: { page, sheet, table, snippet }. Keep snippet to
  the few words/numbers needed to identify the source, not a long quote.
- record any internal inconsistencies in conflicts.

Use the element vocabulary: external_wall | special_wall | garage_wall | ceiling | ceiling_outdoor | roof.

Output ONLY the energy_report JSON object, no prose, no markdown fences:
${JSON.stringify(
  { present: true, standard: 'string|null', climate_zone: 'string|null', star_rating: 'string|null',
    requirements: SCHEMA_EXAMPLE.energy_report.requirements, conflicts: SCHEMA_EXAMPLE.energy_report.conflicts },
  null,
  2
)}`;
}

// PASS B — plans / geometry. When an energy report was processed in Pass A its
// distilled requirements are injected as TEXT (small) so this pass can tag
// ceiling/wall R-values WITHOUT re-reading the long PDF.
export function buildPlansInstructions({ energyRequirements }) {
  const hasEnergy = Array.isArray(energyRequirements) && energyRequirements.length > 0;
  return `You are reading architectural plans to produce a STRUCTURED DATA EXTRACT for an insulation
take-off. DO NOT calculate areas, totals, or deductions. Return raw readings only, as a single JSON
object matching the schema below. If a value is printed/labelled on the drawing, mark its "source" as
"labelled"; if you had to read it off the drawing without a printed dimension, mark it "scaled" and
lower the "confidence". Never invent a value to fill a gap — instead add an entry to "flags".
For every measurement row, include source_ref where possible:
{ "page": number|null, "sheet": "A101 or similar|null", "table": "door schedule / area schedule / wall schedule|null", "snippet": "short identifying text or dimension|null" }.
Keep snippets short; they are for traceability, not full transcription.

Step 1 — Energy requirements. ${hasEnergy
    ? `An energy report has ALREADY been processed; its insulation requirements are provided below as
JSON. Use them ONLY to tag ceilings/walls with the right R-value and "insulated" flag. DO NOT re-read
or re-derive an energy report and DO NOT re-output the requirements — set "energy_report" to
{"present": true, "requirements": []} (it will be merged in from the separate pass).

PROCESSED ENERGY REQUIREMENTS:
${JSON.stringify(energyRequirements, null, 2)}`
    : 'NO energy report was supplied. Set energy_report.present=false, add a flag, and infer likely requirements ONLY from notes on the plans (e.g. the "Energy Efficiency" notes block), marking them low confidence.'}

Step 2 — Project & builder. Extract address, lot/plan number, builder, designer, client, and drawing
revision/number from the title block / site plan. If no address is shown, set address_source="missing"
and add a flag (the file will be named from the drawing/job number).

Step 3 — External walls. From the floor plans, elevations and any wall schedule, list every external
wall SEGMENT, one row each, with level (ground/first), location/zone, length_m, height_m, orientation,
and material classified as "brick", "hebel", or "lightweight" (group ALL cladding types —
Scyon/Axon/linea/weatherboard/EPS/fibre-cement — under "lightweight"). Determine material per façade
from the elevations. Prefer labelled dimensions; use a wall/area schedule if one exists (e.g. a BERS
"External wall schedule" lists height + width + orientation per segment — use it and mark "labelled").

Step 4 — Gables. List any gable ends separately with base_width_m and roof pitch_deg (read from
elevations/sections). Provide gable_height_m only if it is printed; otherwise leave null (code will
compute it from width and pitch).

Step 5 — Openings (doors). From the door schedule and plans, list external door openings with
height_m, width_m, the material of the wall they sit in, and level. Prefer explicit schedule dimensions
in mm. If only a 4-digit code is shown, interpret it as HHWW in decimetres (e.g. 2121 = 2.1m × 2.1m;
2448 = 2.4m × 4.8m) and set source="code". Capture windows for reference if easy, but they will NOT be
deducted.

Step 6 — Garage internal walls. List internal garage walls (the garage/house common wall etc.) with
length and height, and any openings in them.

Step 7 — Ceilings. List ceiling areas by area_type (living, garage, alfresco, patio, porch, balcony, …).
Use the drawing's area schedule as the primary source where present, cross-check against floor-covering/
floor plans, and tag each with the R-value the energy report assigns to it and whether it is insulated.
For two-storey homes, note that inter-floor ceilings are usually not insulated — only flag a ceiling as
insulated where the energy report calls for it.

Step 8 — Reconcile & flag. Where the energy report and the plans conflict (e.g. report says R2.0 walls
but a wall type on the plan shows no insulation), record it in energy_report.conflicts and flags — DO
NOT resolve it silently. Put every assumption and every scaled (vs labelled) value into assumptions.

Output ONLY the JSON object, no commentary, no markdown fences. The JSON must match this shape (these
are type hints, not literal values):

${JSON.stringify(SCHEMA_EXAMPLE, null, 2)}`;
}

// Defensive parse: strip ```json fences and parse. Throws with the raw text
// attached so the route can surface it instead of crashing.
export function parseExtraction(raw) {
  let text = (raw || '').trim();
  // Strip fenced code block if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // If there's leading/trailing prose, grab the outermost JSON object.
  if (!text.startsWith('{')) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1) text = text.slice(first, last + 1);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error('Model did not return valid JSON');
    err.code = 'BAD_JSON';
    err.raw = raw;
    throw err;
  }
}
