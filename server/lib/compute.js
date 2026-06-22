// Deterministic take-off maths (§8). Pure: no DB, no I/O. Operates on the
// (possibly user-edited) take-off JSON and an optional price context.
//
// Two passes:
//   (a) measurements — always run, never depend on R-values.
//   (b) spec + quote — only when R-values are known (report or manual) AND a
//       price context is supplied with a real pricing mode. Otherwise quote=null.

import { validateTakeoff } from './validation.js';

const MATERIALS = ['brick', 'hebel', 'lightweight'];
const LEVELS = ['ground', 'first'];

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function normMaterial(m) {
  const s = (m || '').toLowerCase();
  if (s.includes('brick')) return 'brick';
  if (s.includes('hebel')) return 'hebel';
  return 'lightweight';
}
function normLevel(l) {
  const s = (l || '').toLowerCase();
  return s.includes('first') || s.includes('upper') || s.includes('1') ? 'first' : 'ground';
}

// ---- (a) MEASUREMENTS ------------------------------------------------------

function computeExternalWalls(takeoff) {
  const rows = (takeoff.walls_external || []).map((w, i) => {
    const material = normMaterial(w.material);
    const level = normLevel(w.level);
    const gross = round2(num(w.length_m) * num(w.height_m));
    return {
      id: `wall_${i}`,
      level,
      location: w.location || '',
      material,
      orientation: w.orientation || '',
      length_m: num(w.length_m),
      height_m: num(w.height_m),
      gross_m2: gross,
      source: w.source || '',
      source_ref: w.source_ref || sourceRefFromLegacy(w),
      confidence: w.confidence || '',
      notes: w.notes || '',
      r_value: w.r_value || null,
    };
  });

  // Door deductions at the material × level GROUP level (locked decision #3).
  const doorDeduction = {}; // key `${material}|${level}` -> m2
  for (const d of takeoff.openings?.doors || []) {
    const material = normMaterial(d.in_material);
    const level = normLevel(d.level);
    const area = num(d.height_m) * num(d.width_m);
    const key = `${material}|${level}`;
    doorDeduction[key] = (doorDeduction[key] || 0) + area;
  }

  // Group gross by material×level.
  const groups = {};
  for (const m of MATERIALS) {
    for (const l of LEVELS) {
      groups[`${m}|${l}`] = { material: m, level: l, gross_m2: 0, door_deduction_m2: 0, net_m2: 0 };
    }
  }
  for (const r of rows) {
    groups[`${r.material}|${r.level}`].gross_m2 += r.gross_m2;
  }
  for (const [key, area] of Object.entries(doorDeduction)) {
    if (groups[key]) groups[key].door_deduction_m2 += area;
  }
  for (const g of Object.values(groups)) {
    g.gross_m2 = round2(g.gross_m2);
    g.door_deduction_m2 = round2(g.door_deduction_m2);
    g.net_m2 = round2(Math.max(0, g.gross_m2 - g.door_deduction_m2));
  }

  return { rows, groups, doorDeduction };
}

function computeGables(takeoff) {
  return (takeoff.gables || []).map((g, i) => {
    const base = num(g.base_width_m);
    let height = g.gable_height_m == null ? null : num(g.gable_height_m);
    let heightSource = 'labelled';
    if (height == null) {
      const pitch = num(g.pitch_deg);
      height = round2((base / 2) * Math.tan((pitch * Math.PI) / 180));
      heightSource = 'computed_from_pitch';
    }
    const area = round2(0.5 * base * height);
    return {
      id: `gable_${i}`,
      level: normLevel(g.level),
      location: g.location || '',
      base_width_m: base,
      pitch_deg: g.pitch_deg == null ? null : num(g.pitch_deg),
      gable_height_m: height,
      gable_height_source: heightSource,
      area_m2: area,
      material: normMaterial(g.material),
      source: g.source || '',
      source_ref: g.source_ref || sourceRefFromLegacy(g),
      confidence: g.confidence || '',
      notes: g.notes || '',
    };
  });
}

function computeGarageInternal(takeoff) {
  return (takeoff.garage_internal_walls || []).map((w, i) => {
    const gross = round2(num(w.length_m) * num(w.height_m));
    const ded = round2((w.openings || []).reduce((s, o) => s + num(o.height_m) * num(o.width_m), 0));
    return {
      id: `garage_${i}`,
      location: w.location || '',
      length_m: num(w.length_m),
      height_m: num(w.height_m),
      gross_m2: gross,
      opening_deduction_m2: ded,
      net_m2: round2(Math.max(0, gross - ded)),
      source: w.source || '',
      source_ref: w.source_ref || sourceRefFromLegacy(w),
      confidence: w.confidence || '',
      notes: w.notes || '',
      r_value: w.r_value || null,
    };
  });
}

function computeCeilings(takeoff) {
  return (takeoff.ceilings || []).map((c, i) => {
    let area = c.area_m2 == null ? null : num(c.area_m2);
    let areaSource = 'direct';
    if (area == null && c.length_m != null && c.width_m != null) {
      area = round2(num(c.length_m) * num(c.width_m));
      areaSource = 'l_x_w';
    }
    return {
      id: `ceiling_${i}`,
      area_type: c.area_type || '',
      level: c.level ? normLevel(c.level) : null,
      length_m: c.length_m == null ? null : num(c.length_m),
      width_m: c.width_m == null ? null : num(c.width_m),
      area_m2: area == null ? 0 : round2(area),
      area_source: areaSource,
      r_value: c.r_value || null,
      insulated: Boolean(c.insulated),
      source: c.source || '',
      source_ref: c.source_ref || sourceRefFromLegacy(c),
      confidence: c.confidence || '',
      notes: c.notes || '',
    };
  });
}

function buildMaterialBreakup(wallGroups, gables) {
  // Matrix material × level from wall net, plus gable area folded into material totals.
  const matrix = {};
  const materialTotals = {};
  for (const m of MATERIALS) {
    matrix[m] = { ground: 0, first: 0, walls_total: 0, gables: 0, total: 0 };
    materialTotals[m] = 0;
  }
  for (const g of Object.values(wallGroups)) {
    matrix[g.material][g.level] = g.net_m2;
    matrix[g.material].walls_total += g.net_m2;
  }
  for (const gb of gables) {
    matrix[gb.material].gables += gb.area_m2;
  }
  for (const m of MATERIALS) {
    matrix[m].walls_total = round2(matrix[m].walls_total);
    matrix[m].gables = round2(matrix[m].gables);
    matrix[m].total = round2(matrix[m].walls_total + matrix[m].gables);
    materialTotals[m] = matrix[m].total;
  }
  // Brick/Hebel combined headline + Lightweight headline.
  const brickHebel = round2(materialTotals.brick + materialTotals.hebel);
  const lightweight = materialTotals.lightweight;
  return { matrix, materialTotals, brickHebel, lightweight };
}

// ---- R-value resolution ----------------------------------------------------

function normR(r) {
  if (!r) return null;
  const m = String(r).match(/R?\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? m[1] : null;
}

function wallRequirementR(takeoff) {
  const reqs = takeoff.energy_report?.requirements || [];
  const ext = reqs.find((r) => (r.element || '').toLowerCase() === 'external_wall');
  return ext ? ext.r_value : null;
}

function sourceRefFromLegacy(row) {
  if (!row) return null;
  if (row.source_page || row.source_sheet || row.source_snippet) {
    return {
      page: row.source_page || null,
      sheet: row.source_sheet || null,
      table: row.source_table || null,
      snippet: row.source_snippet || null,
    };
  }
  return null;
}

// ---- (b) SPEC + QUOTE ------------------------------------------------------

function findProduct(products, category, rValue) {
  if (!products || !products.length) return null;
  const r = normR(rValue);
  const inCat = products.filter((p) => p.active !== 0 && p.category === category);
  if (!inCat.length) return null;
  if (r) {
    const byR = inCat.find((p) => normR(p.code) === r || normR(p.name) === r);
    if (byR) return byR;
  }
  // No R match: return null so the line is flagged blank rather than mis-priced.
  return null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function resolveRate(product, builderRates, lineOverride) {
  const hasSupplyOverride = hasOwn(lineOverride, 'supply_rate');
  const hasInstallOverride = hasOwn(lineOverride, 'install_rate');

  if (!product && !hasSupplyOverride && !hasInstallOverride) {
    return { supply_rate: null, install_rate: null, rate_source: 'unmatched' };
  }

  let base = { supply_rate: null, install_rate: null, rate_source: 'unmatched' };
  if (!product) {
    base = { supply_rate: null, install_rate: null, rate_source: 'manual override' };
  } else {
    const override = builderRates ? builderRates[product.id] : null;
    base = override
      ? {
          supply_rate: num(override.supply_rate),
          install_rate: num(override.install_rate),
          rate_source: 'builder override',
        }
      : {
          supply_rate: num(product.default_supply_rate),
          install_rate: num(product.default_install_rate),
          rate_source: 'product default',
        };
  }

  if (hasSupplyOverride || hasInstallOverride) {
    return {
      supply_rate: hasSupplyOverride
        ? lineOverride.supply_rate == null
          ? null
          : num(lineOverride.supply_rate)
        : base.supply_rate,
      install_rate: hasInstallOverride
        ? lineOverride.install_rate == null
          ? null
          : num(lineOverride.install_rate)
        : base.install_rate,
      rate_source: 'manual override',
    };
  }

  return base;
}

function buildQuoteLines(takeoff, measurements, price) {
  const { products = [], builderRates = null, lineOverrides = {} } = price || {};
  const lines = [];
  const breakup = measurements.materialBreakup;
  const defWallR = wallRequirementR(takeoff);

  const addLine = (id, label, category, rValue, net) => {
    if (net <= 0) return;
    const ov = lineOverrides[id] || {};
    const rEff = ov.r_value || rValue || null;
    const product = hasOwn(ov, 'product_id')
      ? ov.product_id == null
        ? null
        : products.find((p) => p.id === ov.product_id) || null
      : findProduct(products, category, rEff);
    const rate = resolveRate(product, builderRates, ov);
    const supply = rate.supply_rate;
    const install = rate.install_rate;
    const lineCost =
      supply == null || install == null ? null : round2(net * (supply + install));
    lines.push({
      id,
      label,
      category,
      r_value: rEff,
      net_m2: round2(net),
      product: product ? { id: product.id, code: product.code, name: product.name } : null,
      supply_rate: supply,
      install_rate: install,
      rate_source: rate.rate_source,
      line_cost: lineCost,
      flagged: lineCost == null,
    });
  };

  // Wall lines per material×level.
  for (const g of Object.values(measurements.externalWalls.groups)) {
    const cat = g.material === 'brick' || g.material === 'hebel' ? 'external_wall' : 'external_wall';
    addLine(
      `wall:${g.material}:${g.level}`,
      `${g.material} wall — ${g.level}`,
      cat,
      defWallR,
      g.net_m2
    );
  }
  // Gable lines per material.
  for (const m of MATERIALS) {
    const gableArea = breakup.matrix[m].gables;
    addLine(`gable:${m}`, `${m} gables`, 'external_wall', defWallR, gableArea);
  }
  // Garage internal wall (single rollup line).
  const garageNet = round2(measurements.garageInternal.reduce((s, w) => s + w.net_m2, 0));
  const garageReq = (takeoff.energy_report?.requirements || []).find(
    (r) => (r.element || '').toLowerCase() === 'garage_wall'
  );
  addLine('garage:common', 'Garage internal wall', 'garage_wall', garageReq?.r_value || null, garageNet);

  // Ceilings — insulated only, by area_type + R.
  for (const c of measurements.ceilings) {
    if (!c.insulated) continue;
    const cat = ['alfresco', 'patio', 'porch', 'balcony', 'outdoor'].some((t) =>
      (c.area_type || '').toLowerCase().includes(t)
    )
      ? 'ceiling_outdoor'
      : 'ceiling';
    addLine(`ceiling:${c.id}`, `Ceiling — ${c.area_type}`, cat, c.r_value, c.area_m2);
  }

  const anyUnpriced = lines.some((l) => l.line_cost == null);
  const total = anyUnpriced ? null : lines.reduce((s, l) => s + l.line_cost, 0);
  return { lines, total: total == null ? null : round2(total), anyUnpriced };
}

// ---- public API ------------------------------------------------------------

export function computeTakeoff(takeoff, options = {}) {
  const t = takeoff || {};
  const externalWalls = computeExternalWalls(t);
  const gables = computeGables(t);
  const garageInternal = computeGarageInternal(t);
  const ceilings = computeCeilings(t);
  const materialBreakup = buildMaterialBreakup(externalWalls.groups, gables);

  const ceilingInsulatedByType = {};
  let ceilingInsulatedTotal = 0;
  let ceilingGrossTotal = 0;
  for (const c of ceilings) {
    ceilingGrossTotal += c.area_m2;
    if (c.insulated) {
      ceilingInsulatedByType[c.area_type] = round2(
        (ceilingInsulatedByType[c.area_type] || 0) + c.area_m2
      );
      ceilingInsulatedTotal += c.area_m2;
    }
  }

  const measurements = {
    externalWalls,
    gables,
    garageInternal,
    ceilings,
    materialBreakup,
    summary: {
      brick_hebel_m2: materialBreakup.brickHebel,
      lightweight_m2: materialBreakup.lightweight,
      brick_m2: materialBreakup.materialTotals.brick,
      hebel_m2: materialBreakup.materialTotals.hebel,
      gables_m2: round2(gables.reduce((s, g) => s + g.area_m2, 0)),
      garage_internal_m2: round2(garageInternal.reduce((s, w) => s + w.net_m2, 0)),
      ceiling_insulated_m2: round2(ceilingInsulatedTotal),
      ceiling_gross_m2: round2(ceilingGrossTotal),
      ceiling_insulated_by_type: ceilingInsulatedByType,
    },
  };

  // Decide whether we can produce a quote.
  const pricingMode = options.pricing?.mode || 'none';
  const haveR =
    Boolean(wallRequirementR(t)) ||
    ceilings.some((c) => c.insulated && c.r_value) ||
    Object.keys(options.pricing?.lineOverrides || {}).length > 0;

  let quote = null;
  if (pricingMode !== 'none' && (haveR || pricingMode === 'manual')) {
    quote = buildQuoteLines(t, measurements, options.pricing || {});
  }

  const validation = validateTakeoff(t, measurements, quote);

  return {
    project: t.project || {},
    energy_report: t.energy_report || { present: false },
    measurements,
    quote,
    assumptions: t.assumptions || [],
    flags: t.flags || [],
    user_resolutions: t.user_resolutions || {},
    issue_actions: t.issue_actions || {},
    validation,
    meta: {
      pricing_mode: pricingMode,
      have_r_values: haveR,
      quote_available: quote != null,
    },
  };
}

export { normR, normMaterial, normLevel };
