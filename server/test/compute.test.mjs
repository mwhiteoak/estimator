import assert from 'node:assert/strict';
import test from 'node:test';
import { computeTakeoff } from '../lib/compute.js';
import { buildWorkbook } from '../lib/excel.js';

const products = [
  { id: 1, active: 1, category: 'external_wall', code: 'WALL_R2.0', name: 'Wall R2.0', default_supply_rate: 3, default_install_rate: 4 },
  { id: 2, active: 1, category: 'ceiling', code: 'CEIL_R3.5', name: 'Ceiling R3.5', default_supply_rate: 5, default_install_rate: 6 },
  { id: 3, active: 1, category: 'ceiling_outdoor', code: 'OUT_R1.5', name: 'Outdoor R1.5', default_supply_rate: 7, default_install_rate: 8 },
  { id: 4, active: 1, category: 'wall_wrap', code: 'WRAP_VP', name: 'Vapour-permeable wrap', default_supply_rate: 3.5, default_install_rate: 3 },
  { id: 5, active: 1, category: 'subfloor_wrap', code: 'WRAP_SF', name: 'Subfloor wrap', default_supply_rate: 3.5, default_install_rate: 3 },
  { id: 6, active: 1, category: 'sealant', code: 'SEAL_CONT', name: 'Continuous draught seal', default_supply_rate: 2, default_install_rate: 1.5 },
];

function fixture(overrides = {}) {
  return {
    project: { address: 'Unit Test' },
    energy_report: {
      present: true,
      requirements: [
        { element: 'external_wall', location: 'all', r_value: 'R2.0' },
        { element: 'ceiling', location: 'living', r_value: 'R3.5' },
      ],
    },
    walls_external: [
      { level: 'ground', location: 'front', material: 'brick', length_m: 10, height_m: 2.4, source: 'labelled', confidence: 'high' },
      { level: 'first', location: 'upper', material: 'lightweight', length_m: 5, height_m: 2.4, source: 'labelled', confidence: 'high' },
    ],
    openings: {
      doors: [{ location: 'entry', height_m: 2, width_m: 1, in_material: 'brick', level: 'ground', source: 'schedule' }],
    },
    gables: [{ level: 'first', location: 'front', base_width_m: 6, pitch_deg: 30, gable_height_m: null, material: 'lightweight', source: 'scaled', confidence: 'medium' }],
    garage_internal_walls: [{ location: 'garage', length_m: 5, height_m: 2.4, openings: [{ height_m: 2, width_m: 0.8 }], source: 'labelled', confidence: 'high' }],
    ceilings: [
      { area_type: 'living', area_m2: 40, r_value: 'R3.5', insulated: true, source: 'area_schedule', confidence: 'high' },
      { area_type: 'interfloor', area_m2: 25, r_value: null, insulated: false, source: 'floor_plan', confidence: 'high' },
    ],
    assumptions: [],
    flags: [],
    ...overrides,
  };
}

test('computes wall wrap by level and continuous item totals, and prices them as unmatched-by-default lines', () => {
  const result = computeTakeoff(
    fixture({
      wall_wrap: [
        { level: 'ground', location: 'Lower walls', wrap_type: 'foil sarking', area_m2: 126, source: 'schedule', confidence: 'high' },
        { level: 'first', location: 'Upper walls', wrap_type: 'class 4 wrap', area_m2: 127, source: 'schedule', confidence: 'high' },
        { level: 'subfloor', location: 'Subfloor', wrap_type: 'class 4 wrap', area_m2: 9, source: 'schedule', confidence: 'high' },
      ],
      continuous_items: [
        { location: 'Upper junctions', level: 'first', item_type: 'draught seal', length_m: 25, source: 'schedule', confidence: 'high' },
      ],
    }),
    { pricing: { mode: 'auto', products, lineOverrides: {} } }
  );

  assert.deepEqual(result.measurements.wallWrap.byLevel, { ground: 126, first: 127, subfloor: 9, gable: 0 });
  assert.equal(result.measurements.wallWrap.total, 262);
  assert.equal(result.measurements.continuousItems.total, 25);
  assert.equal(result.measurements.summary.wrap_total_m2, 262);
  assert.equal(result.measurements.summary.continuous_total_lm, 25);

  const wrapGround = result.quote.lines.find((l) => l.id === 'wrap:ground');
  assert.equal(wrapGround.qty, 126);
  assert.equal(wrapGround.unit, 'm2');
  // No R-value to match against — wrap/sealant lines come back unmatched by
  // default, same as any other unresolvable category, and get flagged.
  assert.equal(wrapGround.product, null);
  assert.equal(wrapGround.flagged, true);

  const continuous = result.quote.lines.find((l) => l.id === 'continuous:rollup');
  assert.equal(continuous.qty, 25);
  assert.equal(continuous.unit, 'lm');
});

test('wall wrap with no measured area derives from the cladding wall area for that level', () => {
  // Mirrors a real extraction: the AI correctly identifies a wrap requirement
  // ("Class 4 vapour-permeable wrap to cladded external walls") from the
  // energy report, but the plans/elevations give no printed wrap area — it
  // shouldn't have to re-measure what walls_external already measured.
  const withGroundCladding = fixture({
    walls_external: [
      { level: 'ground', location: 'front', material: 'brick', length_m: 10, height_m: 2.4, source: 'labelled', confidence: 'high' },
      { level: 'ground', location: 'side', material: 'lightweight', length_m: 8, height_m: 2.4, source: 'labelled', confidence: 'high' },
      { level: 'first', location: 'upper', material: 'lightweight', length_m: 5, height_m: 2.4, source: 'labelled', confidence: 'high' },
    ],
    wall_wrap: [
      { level: 'ground', location: 'Cladded ground floor walls', wrap_type: 'class 4 vapour-permeable wrap', source: 'schedule', confidence: 'medium' },
    ],
  });
  const result = computeTakeoff(withGroundCladding, { pricing: { mode: 'none' } });
  assert.equal(result.measurements.externalWalls.groups['lightweight|ground'].net_m2, 19.2); // 8 * 2.4
  assert.equal(result.measurements.wallWrap.byLevel.ground, 19.2);
  assert.equal(result.measurements.wallWrap.rows[0].area_source, 'derived_from_cladding_area');

  // A row that DOES give a direct area is never overridden by the fallback.
  const directArea = computeTakeoff(
    fixture({
      wall_wrap: [{ level: 'ground', location: 'x', wrap_type: 'foil', area_m2: 5, source: 'schedule', confidence: 'high' }],
    }),
    { pricing: { mode: 'none' } }
  );
  assert.equal(directArea.measurements.wallWrap.rows[0].area_source, 'direct');
  assert.equal(directArea.measurements.wallWrap.byLevel.ground, 5);
});

test('computes wall door deductions, gables, garage, and ceiling totals', () => {
  const result = computeTakeoff(fixture(), { pricing: { mode: 'none' } });
  assert.equal(result.measurements.externalWalls.groups['brick|ground'].net_m2, 22);
  assert.equal(result.measurements.gables[0].gable_height_m, 1.73);
  assert.equal(result.measurements.summary.lightweight_m2, 17.19);
  assert.equal(result.measurements.summary.garage_internal_m2, 10.4);
  assert.equal(result.measurements.summary.ceiling_insulated_m2, 40);
  assert.equal(result.measurements.summary.ceiling_gross_m2, 65);
});

test('matches products by R-value and requires complete rates for a total', () => {
  const result = computeTakeoff(fixture(), { pricing: { mode: 'auto', products, lineOverrides: {} } });
  const brick = result.quote.lines.find((l) => l.id === 'wall:brick:ground');
  assert.equal(brick.product.code, 'WALL_R2.0');
  assert.equal(brick.line_cost, 154);
  assert.equal(result.quote.total, null);
  assert.equal(result.quote.anyUnpriced, true);
});

test('manual rate override preserves the unedited side from product defaults', () => {
  const result = computeTakeoff(fixture(), {
    pricing: { mode: 'auto', products, lineOverrides: { 'wall:brick:ground': { supply_rate: 10 } } },
  });
  const brick = result.quote.lines.find((l) => l.id === 'wall:brick:ground');
  assert.equal(brick.supply_rate, 10);
  assert.equal(brick.install_rate, 4);
  assert.equal(brick.line_cost, 308);
});

test('explicit unmatched product override remains unmatched', () => {
  const result = computeTakeoff(fixture(), {
    pricing: { mode: 'auto', products, lineOverrides: { 'wall:brick:ground': { product_id: null } } },
  });
  const brick = result.quote.lines.find((l) => l.id === 'wall:brick:ground');
  assert.equal(brick.product, null);
  assert.equal(brick.line_cost, null);
});

test('validation flags suspicious dimensions and missing quote rates', () => {
  const result = computeTakeoff(
    fixture({ walls_external: [{ level: 'first', location: 'odd', material: 'brick', length_m: 3, height_m: 4.2 }] }),
    { pricing: { mode: 'auto', products, lineOverrides: {} } }
  );
  assert.ok(result.validation.issues.some((i) => i.id.startsWith('wall-height')));
  assert.ok(result.validation.issues.some((i) => i.id === 'first-without-ground'));
  assert.ok(result.validation.issues.some((i) => i.id.startsWith('quote-unpriced')));
});

test('workbook quote formulas leave incomplete totals blank', async () => {
  const result = computeTakeoff(fixture(), { pricing: { mode: 'auto', products, lineOverrides: {} } });
  const wb = await buildWorkbook(result);
  const quote = wb.getWorksheet('Quote');
  const firstLineFormula = quote.getRow(2).getCell(8).value.formula;
  const totalFormula = quote.getRow(quote.rowCount).getCell(8).value.formula;
  assert.match(firstLineFormula, /IF\(OR/);
  assert.match(totalFormula, /COUNTBLANK/);
});
