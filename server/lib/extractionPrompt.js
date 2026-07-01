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
  wall_wrap: [
    { level: 'ground|first|subfloor|gable', location: 'string',
      wrap_type: 'string, e.g. "foil sarking" | "class 4 vapour-permeable wrap"',
      area_m2: 'number | null', length_m: 'number | null', height_m: 'number | null',
      source: 'labelled|scaled|schedule', source_ref: { page: 'number | null', sheet: 'string | null', table: 'string | null', snippet: 'string | null' },
      confidence: 'high|medium|low', notes: 'string' },
  ],
  continuous_items: [
    { location: 'string', level: 'string',
      item_type: 'string, e.g. "draught seal" | "expanding foam" | "acoustic sealant" | "continuous vapour barrier"',
      length_m: 'number',
      source: 'labelled|scaled|schedule', source_ref: { page: 'number | null', sheet: 'string | null', table: 'string | null', snippet: 'string | null' },
      confidence: 'high|medium|low', notes: 'string' },
  ],
  assumptions: [
    { topic: 'string', assumption: 'string', basis: 'string', confidence: 'high|medium|low' },
  ],
  flags: [
    { severity: 'info|warn|error', message: 'string', location: 'string' },
  ],
};

// Quick pre-check pass — reads ONLY the site address off a single document (either
// the plans or the energy report) so the two can be compared before the full,
// expensive extraction runs. Deliberately ignores buildEnergyInstructions()'s
// "ignore the cover page" rule, since the cover/title page is exactly where the
// site address lives.
export function buildAddressCheckInstructions(kind) {
  const doc = kind === 'energy_report' ? 'energy-efficiency report (NatHERS / BERS / FirstRate / similar)' : 'set of architectural plans';
  return `You are looking ONLY for the SITE / PROPERTY ADDRESS on this ${doc}.

Check the cover page, title block, or site plan for the property's street address (number, street,
suburb). Do not read anything else on the document. Do not calculate anything.

Output ONLY this JSON object, no prose, no markdown fences:
{ "address": "string | null", "lot": "string | null", "plan_number": "string | null", "confidence": "high | medium | low" }`;
}

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
  batts), garage walls, ceilings, outdoor/alfresco/patio ceilings, roof/sarking, wall wrap (by level —
  lower/ground, upper/first, subfloor, gables), and any continuous sealing/draught-sealing requirement
  — each with its element, location/zone, R-value (where applicable — wrap/sealing items often have
  none), build_up (bulk, anti-glare foil, reflective/vapour-permeable sarking, fire batts, wrap type,
  sealant type) and source_page.
- include a short source_ref object where possible: { page, sheet, table, snippet }. Keep snippet to
  the few words/numbers needed to identify the source, not a long quote.
- record any internal inconsistencies in conflicts.

Use the element vocabulary: external_wall | special_wall | garage_wall | ceiling | ceiling_outdoor | roof
| wall_wrap | subfloor_wrap | continuous_sealing.

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

Step 3 — External walls. Do NOT collapse an entire elevation face into one row using only the overall
building width/depth — that throws away the material split and overstates or understates individual
segments. Instead, for EACH external face:
  (a) On the GROUND FLOOR PLAN and FIRST FLOOR PLAN sheets, find the dimension chain that runs along
      that face (the sequence of numbers between the extension lines just outside the plan, e.g.
      "6000, 1650, 1350, 4700, ..."). Each number in that chain is one wall run. Match each run to the
      room(s) it fronts (read the adjacent room label) — that room name/zone is the row's "location".
  (b) On the matching ELEVATION sheet for that same face, find which material legend code (e.g.
      Cbr/brick, Fca-133 or similar/lightweight cladding, Eps/lightweight, Hebel) sits above each run's
      horizontal position, and classify that run as "brick", "hebel", or "lightweight" (group ALL
      cladding types — Scyon/Axon/linea/weatherboard/EPS/fibre-cement — under "lightweight").
      A single face commonly mixes materials (e.g. brick at ground, cladding above, or brick with a
      cladded section) — do not force one material onto the whole face.
  (c) height_m comes from the elevation's floor-to-ceiling level markers for that level (e.g. the gap
      between "L00 Ground Floor" and "L01 Ground Floor Ceiling", or "L02 First Floor" and "L03 First
      Floor Ceiling") or a wall/area schedule if present (e.g. a BERS "External wall schedule" lists
      height + width + orientation per segment — use it directly and mark "labelled").
  Only fall back to a single whole-face row with the overall building dimension, and only if the
  floor plan truly has no dimension chain for that face (flag this explicitly) — this should be the
  exception, not the default.

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

Step 8 — Wall wrap / subfloor wrap. Many energy reports require a reflective foil sarking or class 4
vapour-permeable wrap behind the external cladding, and sometimes a separate subfloor wrap for a
suspended floor. List each as a "wall_wrap" row tagged with level ("ground"/"lower", "first"/"upper",
"subfloor", or "gable") and wrap_type (the material named in the energy report or plans notes — e.g.
"foil sarking", "class 4 vapour-permeable wrap"). Give area_m2 directly if the plans/report state a
total, otherwise give length_m and height_m for the code to compute it (same rule as ceilings: prefer a
direct figure, fall back to dimensions). If no wrap requirement is mentioned anywhere, leave this array
empty — do not invent one.

Step 9 — Continuous / linear sealing items. Some energy reports require continuous draught sealing,
expanding foam, or an acoustic sealant bead at specific junctions, measured in lineal metres rather
than area. List each as a "continuous_items" row with item_type, level/location, and length_m. Only
include these if the energy report or plans notes actually specify one — do not invent a figure.

Step 10 — Reconcile & flag. Where the energy report and the plans conflict (e.g. report says R2.0 walls
but a wall type on the plan shows no insulation), record it as a "flags" entry (severity "warn" or
"error") — DO NOT resolve it silently. Only add it to energy_report.conflicts as well if you were told
above to produce the full energy_report object yourself (i.e. no energy report was supplied); when an
energy report WAS supplied, its own conflicts array is owned by the separate energy-report pass, not by
you, so "flags" is the only place this reconciliation note will be kept. Put every assumption and every
scaled (vs labelled) value into assumptions.

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
