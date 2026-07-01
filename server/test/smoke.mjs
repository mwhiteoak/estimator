// Standalone smoke test for compute.js + excel.js (no AI, no HTTP).
import { computeTakeoff } from '../lib/compute.js';
import { buildWorkbook, safeFilename } from '../lib/excel.js';
import db from '../db/db.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

// Fixture A — Avia Homes, energy report present, lightweight + special wall + ceilings + gable.
const takeoffA = {
  project: { address: '130A Passage Street, Cleveland QLD 4163', lot: 'Lot 2', plan_number: 'SP335173',
    builder: 'AVIA Homes', drawing_revision: 'L.2 15/11/23', address_source: 'labelled', confidence: 'high' },
  energy_report: { present: true, standard: 'BERS Pro / NatHERS', climate_zone: '10', star_rating: '6.0',
    requirements: [
      { element: 'external_wall', location: 'all external excl garage', r_value: 'R2.0' },
      { element: 'special_wall', location: 'zero boundary', r_value: 'R1.7', build_up: '60mm HardieFire' },
      { element: 'ceiling', location: 'ceiling incl garage', r_value: 'R3.5' },
      { element: 'ceiling_outdoor', location: 'alfresco', r_value: 'R1.5' },
    ], conflicts: [] },
  walls_external: [
    { level: 'ground', location: 'Liv/Din/Kit', material: 'lightweight', length_m: 7.0, height_m: 2.7, orientation: 'W', source: 'labelled', confidence: 'high' },
    { level: 'ground', location: 'Garage face', material: 'lightweight', length_m: 6.05, height_m: 2.7, orientation: 'N', source: 'labelled', confidence: 'high' },
    { level: 'first', location: 'Bed 2/3', material: 'lightweight', length_m: 9.4, height_m: 2.55, orientation: 'E', source: 'scaled', confidence: 'medium' },
    { level: 'ground', location: 'Zero boundary', material: 'hebel', length_m: 8.2, height_m: 2.7, orientation: 'S', source: 'labelled', confidence: 'high' },
  ],
  gables: [
    { level: 'first', location: 'front gable', base_width_m: 6.48, pitch_deg: 22.5, gable_height_m: null, material: 'lightweight', source: 'scaled', confidence: 'medium', notes: 'pitch read from elevation' },
  ],
  garage_internal_walls: [
    { location: 'garage/house common wall', length_m: 6.05, height_m: 2.7, openings: [{ height_m: 2.04, width_m: 0.82, note: 'internal door' }], source: 'labelled', confidence: 'high' },
  ],
  openings: { doors: [
    { location: 'Garage', code: '2448', height_m: 2.4, width_m: 4.8, in_material: 'lightweight', level: 'ground', source: 'code' },
    { location: 'Entry', height_m: 2.34, width_m: 1.2, in_material: 'lightweight', level: 'ground', source: 'schedule' },
  ] },
  ceilings: [
    { area_type: 'living', level: 'first', area_m2: 119.0, r_value: 'R3.5', insulated: true, source: 'area_schedule', confidence: 'high' },
    { area_type: 'garage', area_m2: 37.69, r_value: 'R3.5', insulated: true, source: 'area_schedule', confidence: 'high' },
    { area_type: 'alfresco', area_m2: 19.66, r_value: 'R1.5', insulated: true, source: 'area_schedule', confidence: 'high' },
    { area_type: 'interfloor', area_m2: 110.0, r_value: null, insulated: false, source: 'floor_plan', confidence: 'high', notes: 'not insulated' },
  ],
  // Wrap/continuous-item fixture numbers taken from the client's stated
  // expected results for their sample job, to sanity-check the new take-off
  // section end to end even without the real plan/EE report.
  wall_wrap: [
    { level: 'ground', location: 'Lower level external walls', wrap_type: 'foil sarking', area_m2: 126, source: 'schedule', confidence: 'high' },
    { level: 'first', location: 'Upper level external walls', wrap_type: 'class 4 vapour-permeable wrap', area_m2: 127, source: 'schedule', confidence: 'high' },
    { level: 'subfloor', location: 'Subfloor', wrap_type: 'class 4 vapour-permeable wrap', area_m2: 9, source: 'schedule', confidence: 'high' },
  ],
  continuous_items: [
    { location: 'Upper level junctions', level: 'first', item_type: 'continuous draught seal', length_m: 25, source: 'schedule', confidence: 'high' },
  ],
  assumptions: [{ topic: 'wall height', assumption: '2.7m for all GF external walls', basis: 'section', confidence: 'high' }],
  flags: [{ severity: 'info', message: 'Detailed external wall schedule used', location: 'global' }],
};

// Build an auto price context (Avia Homes builder rates).
const avia = db.prepare("SELECT id FROM builders WHERE name='Avia Homes'").get();
const products = db.prepare('SELECT * FROM products WHERE active=1').all();
const builderRates = {};
for (const r of db.prepare('SELECT * FROM builder_rates WHERE builder_id=?').all(avia.id))
  builderRates[r.product_id] = { supply_rate: r.supply_rate, install_rate: r.install_rate };

const resultA = computeTakeoff(takeoffA, { pricing: { mode: 'auto', products, builderRates, lineOverrides: {} } });

console.log('=== Fixture A (priced) ===');
console.log('summary:', JSON.stringify(resultA.measurements.summary, null, 2));
console.log('quote available:', resultA.meta.quote_available, '| total:', resultA.quote?.total, '| anyUnpriced:', resultA.quote?.anyUnpriced);
console.log('quote lines:');
for (const l of resultA.quote.lines)
  console.log(`  ${l.label.padEnd(26)} qty=${String(l.qty).padStart(7)} ${l.unit.padEnd(3)} ${l.product?.code || 'UNMATCHED'} ${l.supply_rate}/${l.install_rate} -> $${l.line_cost}`);
console.log('wrap by level (expect ground=126, first=127, subfloor=9):', JSON.stringify(resultA.measurements.wallWrap.byLevel));
console.log('continuous total (expect 25):', resultA.measurements.continuousItems.total);

// Sanity checks
const s = resultA.measurements.summary;
const expectedLightGround = 7.0 * 2.7 + 6.05 * 2.7 - (2.4 * 4.8 + 2.34 * 1.2); // doors deducted
console.log('\nlightweight ground net (expect ~%s):', expectedLightGround.toFixed(2), '=>', resultA.measurements.externalWalls.groups['lightweight|ground'].net_m2);
console.log('gable height computed (expect (6.48/2)*tan22.5=1.342):', resultA.measurements.gables[0].gable_height_m);

const wbA = await buildWorkbook(resultA);
const fileA = path.join(outDir, `${safeFilename(resultA.project.address)} - Insulation Take-Off.xlsx`);
await wbA.xlsx.writeFile(fileA);
console.log('wrote', fileA);

// Fixture B — plans only, no energy report, mixed façade. Measurements only.
const takeoffB = {
  project: { address: '27 Torres Way, Spring Mountain QLD 4300', lot: '8576', builder: 'Hancock Homes', address_source: 'labelled', confidence: 'high' },
  energy_report: { present: false, requirements: [], conflicts: [] },
  walls_external: [
    { level: 'ground', location: 'Front', material: 'brick', length_m: 11.2, height_m: 2.55, orientation: 'N', source: 'labelled', confidence: 'high' },
    { level: 'ground', location: 'Side cladding', material: 'lightweight', length_m: 8.4, height_m: 2.55, orientation: 'E', source: 'scaled', confidence: 'low' },
  ],
  gables: [],
  garage_internal_walls: [],
  openings: { doors: [{ location: 'Entry', code: '2120', height_m: 2.1, width_m: 2.0, in_material: 'brick', level: 'ground', source: 'code' }] },
  ceilings: [{ area_type: 'living', area_m2: 142.0, r_value: null, insulated: false, source: 'area_schedule', confidence: 'high' }],
  assumptions: [],
  flags: [{ severity: 'warn', message: 'No energy report supplied; requirements inferred from plans only', location: 'global' }],
};
const resultB = computeTakeoff(takeoffB, { pricing: { mode: 'none' } });
console.log('\n=== Fixture B (measurements only) ===');
console.log('quote available (expect false):', resultB.meta.quote_available);
console.log('brick+hebel:', resultB.measurements.summary.brick_hebel_m2, '| lightweight:', resultB.measurements.summary.lightweight_m2);
const wbB = await buildWorkbook(resultB);
const fileB = path.join(outDir, `${safeFilename(resultB.project.address)} - Insulation Take-Off.xlsx`);
await wbB.xlsx.writeFile(fileB);
console.log('wrote', fileB, '(no Quote tab expected)');
console.log('tabs:', wbB.worksheets.map((w) => w.name).join(', '));

console.log('\nSMOKE OK');
