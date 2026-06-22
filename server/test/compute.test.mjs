import assert from 'node:assert/strict';
import test from 'node:test';
import { computeTakeoff } from '../lib/compute.js';
import { buildWorkbook } from '../lib/excel.js';

const products = [
  { id: 1, active: 1, category: 'external_wall', code: 'WALL_R2.0', name: 'Wall R2.0', default_supply_rate: 3, default_install_rate: 4 },
  { id: 2, active: 1, category: 'ceiling', code: 'CEIL_R3.5', name: 'Ceiling R3.5', default_supply_rate: 5, default_install_rate: 6 },
  { id: 3, active: 1, category: 'ceiling_outdoor', code: 'OUT_R1.5', name: 'Outdoor R1.5', default_supply_rate: 7, default_install_rate: 8 },
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
  const firstLineFormula = quote.getRow(2).getCell(7).value.formula;
  const totalFormula = quote.getRow(quote.rowCount).getCell(7).value.formula;
  assert.match(firstLineFormula, /IF\(OR/);
  assert.match(totalFormula, /COUNTBLANK/);
});
