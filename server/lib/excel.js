// ExcelJS workbook builder (§9). Writes REAL cell formulas — gross/net areas,
// SUMIFS material breakup, gable geometry, cross-sheet Summary refs, and a
// conditional Quote tab. Measurement tabs always render; Quote is conditional.
import ExcelJS from 'exceljs';

const M2 = '0.00';
const MONEY = '$#,##0.00';
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };
const FLAG_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // amber
const TITLE_FONT = { bold: true, size: 14 };

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle' };
  });
}

function lowConfidence(c) {
  const s = (c || '').toLowerCase();
  return s === 'low' || s === 'medium';
}

function setCols(ws, widths) {
  ws.columns = widths.map((w) => ({ width: w }));
}

function sourceCells(row) {
  const ref = row?.source_ref || {};
  return [ref.page || row?.source_page || '', ref.sheet || row?.source_sheet || '', ref.table || row?.source_table || '', ref.snippet || row?.source_snippet || ''];
}

// Sanitise illegal filename chars.
export function safeFilename(base) {
  return (
    (base || 'Take-Off')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Take-Off'
  );
}

export async function buildWorkbook(result) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Insulation Take-Off App';
  wb.created = new Date();

  const m = result.measurements;
  const hasQuote = result.quote != null;

  // ----- Summary -----
  const summary = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 1 }] });
  buildSummary(summary, result, hasQuote);

  // ----- External Walls -----
  const ew = wb.addWorksheet('External Walls', { views: [{ state: 'frozen', ySplit: 1 }] });
  buildExternalWalls(ew, m);

  // ----- Material Breakup -----
  const mb = wb.addWorksheet('Material Breakup', { views: [{ state: 'frozen', ySplit: 1 }] });
  buildMaterialBreakup(mb);

  // ----- Gables -----
  const gb = wb.addWorksheet('Gables', { views: [{ state: 'frozen', ySplit: 1 }] });
  buildGables(gb, m);

  // ----- Garage Internal -----
  const gi = wb.addWorksheet('Garage Internal', { views: [{ state: 'frozen', ySplit: 1 }] });
  buildGarageInternal(gi, m);

  // ----- Ceilings -----
  const ce = wb.addWorksheet('Ceilings', { views: [{ state: 'frozen', ySplit: 1 }] });
  buildCeilings(ce, m);

  // ----- Quote (conditional) -----
  if (hasQuote) {
    const q = wb.addWorksheet('Quote', { views: [{ state: 'frozen', ySplit: 1 }] });
    buildQuote(q, result);
  }

  // ----- Assumptions & Notes -----
  const an = wb.addWorksheet('Assumptions & Notes', { views: [{ state: 'frozen', ySplit: 1 }] });
  buildAssumptions(an, result, hasQuote);

  return wb;
}

function buildExternalWalls(ws, m) {
  setCols(ws, [10, 24, 13, 11, 11, 11, 11, 15, 11, 12, 12, 30, 10, 14, 18, 32]);
  const header = ws.addRow([
    'Level', 'Location', 'Material', 'Orientation', 'Length (m)', 'Height (m)',
    'Gross m²', 'Door Deduction m²', 'Net m²', 'Source', 'Confidence', 'Notes',
    'Source Page', 'Source Sheet', 'Source Table', 'Source Snippet',
  ]);
  styleHeaderRow(header);

  for (const r of m.externalWalls.rows) {
    const row = ws.addRow([
      r.level, r.location, r.material, r.orientation, r.length_m, r.height_m,
      null, 0, null, r.source, r.confidence, r.notes, ...sourceCells(r),
    ]);
    const n = row.number;
    row.getCell(7).value = { formula: `E${n}*F${n}` }; // Gross
    row.getCell(9).value = { formula: `G${n}-H${n}` }; // Net
    [5, 6, 7, 8, 9].forEach((c) => (row.getCell(c).numFmt = M2));
    if (lowConfidence(r.confidence)) row.eachCell((c) => (c.fill = FLAG_FILL));
  }

  // Group-level door deduction lines (locked decision #3): negative Net rows.
  const groups = m.externalWalls.groups;
  for (const g of Object.values(groups)) {
    if (g.door_deduction_m2 > 0) {
      const row = ws.addRow([
        g.level, 'Door deductions (group)', g.material, '', null, null,
        null, g.door_deduction_m2, null, 'group', '', 'Doors deducted at material×level group level',
      ]);
      const n = row.number;
      row.getCell(7).value = 0; // Gross 0 for deduction line
      row.getCell(9).value = { formula: `G${n}-H${n}` }; // Net = -deduction
      [7, 8, 9].forEach((c) => (row.getCell(c).numFmt = M2));
      row.eachCell((c) => (c.font = { italic: true, color: { argb: 'FF92400E' } }));
    }
  }
}

function buildMaterialBreakup(ws) {
  setCols(ws, [16, 13, 13, 14, 12, 12]);
  const header = ws.addRow(['Material', 'Ground m²', 'First m²', 'Walls Total m²', 'Gables m²', 'Total m²']);
  styleHeaderRow(header);

  const EW = "'External Walls'";
  const G = 'Gables';
  const mats = ['brick', 'hebel', 'lightweight'];
  for (const mat of mats) {
    const row = ws.addRow([mat, null, null, null, null, null]);
    const n = row.number;
    row.getCell(2).value = { formula: `SUMIFS(${EW}!I:I,${EW}!C:C,"${mat}",${EW}!A:A,"ground")` };
    row.getCell(3).value = { formula: `SUMIFS(${EW}!I:I,${EW}!C:C,"${mat}",${EW}!A:A,"first")` };
    row.getCell(4).value = { formula: `B${n}+C${n}` };
    row.getCell(5).value = { formula: `SUMIF(${G}!F:F,"${mat}",${G}!E:E)` };
    row.getCell(6).value = { formula: `D${n}+E${n}` };
    [2, 3, 4, 5, 6].forEach((c) => (row.getCell(c).numFmt = M2));
  }
  // Headline rows. brick row = 2, hebel = 3, lightweight = 4.
  const bh = ws.addRow(['Brick + Hebel total', null, null, null, null, null]);
  bh.getCell(6).value = { formula: 'F2+F3' };
  bh.getCell(6).numFmt = M2;
  bh.font = { bold: true };
  const lw = ws.addRow(['Lightweight total', null, null, null, null, null]);
  lw.getCell(6).value = { formula: 'F4' };
  lw.getCell(6).numFmt = M2;
  lw.font = { bold: true };
}

function buildGables(ws, m) {
  setCols(ws, [22, 13, 10, 14, 11, 13, 14, 30, 10, 14, 18, 32]);
  const header = ws.addRow([
    'Location', 'Base Width (m)', 'Pitch (°)', 'Gable Height (m)', 'Area m²', 'Material', 'Source', 'Notes',
    'Source Page', 'Source Sheet', 'Source Table', 'Source Snippet',
  ]);
  styleHeaderRow(header);
  for (const g of m.gables) {
    const row = ws.addRow([
      g.location, g.base_width_m, g.pitch_deg, null, null, g.material, g.source, g.notes, ...sourceCells(g),
    ]);
    const n = row.number;
    if (g.gable_height_source === 'computed_from_pitch') {
      row.getCell(4).value = { formula: `(B${n}/2)*TAN(RADIANS(C${n}))` };
    } else {
      row.getCell(4).value = g.gable_height_m;
    }
    row.getCell(5).value = { formula: `0.5*B${n}*D${n}` };
    [2, 4, 5].forEach((c) => (row.getCell(c).numFmt = M2));
    if (lowConfidence(g.confidence)) row.eachCell((c) => (c.fill = FLAG_FILL));
  }
}

function buildGarageInternal(ws, m) {
  setCols(ws, [28, 11, 11, 11, 16, 11, 12, 30, 10, 14, 18, 32]);
  const header = ws.addRow([
    'Location', 'Length (m)', 'Height (m)', 'Gross m²', 'Opening Deduction m²', 'Net m²', 'Source', 'Notes',
    'Source Page', 'Source Sheet', 'Source Table', 'Source Snippet',
  ]);
  styleHeaderRow(header);
  for (const w of m.garageInternal) {
    const row = ws.addRow([
      w.location, w.length_m, w.height_m, null, w.opening_deduction_m2, null, w.source, w.notes, ...sourceCells(w),
    ]);
    const n = row.number;
    row.getCell(4).value = { formula: `B${n}*C${n}` };
    row.getCell(6).value = { formula: `D${n}-E${n}` };
    [2, 3, 4, 5, 6].forEach((c) => (row.getCell(c).numFmt = M2));
    if (lowConfidence(w.confidence)) row.eachCell((c) => (c.fill = FLAG_FILL));
  }
}

function buildCeilings(ws, m) {
  setCols(ws, [16, 10, 11, 11, 11, 11, 12, 14, 30, 10, 14, 18, 32]);
  const header = ws.addRow([
    'Area Type', 'Level', 'Length (m)', 'Width (m)', 'Area m²', 'R-value', 'Insulated?', 'Source', 'Notes',
    'Source Page', 'Source Sheet', 'Source Table', 'Source Snippet',
  ]);
  styleHeaderRow(header);
  for (const c of m.ceilings) {
    const row = ws.addRow([
      c.area_type, c.level || '', c.length_m, c.width_m, null,
      c.r_value || '', c.insulated ? 'Yes' : 'No', c.source, c.notes, ...sourceCells(c),
    ]);
    const n = row.number;
    if (c.area_source === 'l_x_w') {
      row.getCell(5).value = { formula: `C${n}*D${n}` };
    } else {
      row.getCell(5).value = c.area_m2;
    }
    [3, 4, 5].forEach((cc) => (row.getCell(cc).numFmt = M2));
    if (lowConfidence(c.confidence)) row.eachCell((cell) => (cell.fill = FLAG_FILL));
  }
}

function buildQuote(ws, result) {
  setCols(ws, [28, 30, 10, 12, 13, 13, 14, 30]);
  const header = ws.addRow([
    'Line', 'Product', 'R-value', 'Net m²', 'Supply $/m²', 'Install $/m²', 'Line $', 'Notes',
  ]);
  styleHeaderRow(header);
  const lines = result.quote.lines;
  let firstDataRow = null;
  let lastDataRow = null;
  for (const l of lines) {
    const row = ws.addRow([
      l.label,
      l.product ? `${l.product.code} — ${l.product.name}` : '(unmatched — set product/rate)',
      l.r_value || '',
      l.net_m2,
      l.supply_rate,
      l.install_rate,
      null,
      l.flagged ? 'No product/rate matched — fill in to price' : l.rate_source,
    ]);
    const n = row.number;
    if (firstDataRow == null) firstDataRow = n;
    lastDataRow = n;
    row.getCell(7).value = { formula: `IF(OR(E${n}="",F${n}=""),"",D${n}*(E${n}+F${n}))` };
    [4].forEach((c) => (row.getCell(c).numFmt = M2));
    [5, 6, 7].forEach((c) => (row.getCell(c).numFmt = MONEY));
    if (l.flagged) row.eachCell((c) => (c.fill = FLAG_FILL));
  }
  if (firstDataRow != null) {
    const totalRow = ws.addRow(['', '', '', '', '', 'Quote total', null, '']);
    totalRow.getCell(7).value = {
      formula: `IF(COUNTBLANK(G${firstDataRow}:G${lastDataRow})>0,"",SUM(G${firstDataRow}:G${lastDataRow}))`,
    };
    totalRow.getCell(7).numFmt = MONEY;
    totalRow.font = { bold: true };
    totalRow.getCell(6).font = { bold: true };
  }
}

function buildSummary(ws, result, hasQuote) {
  setCols(ws, [34, 18, 40]);
  const title = ws.addRow(['Insulation Take-Off — Summary']);
  title.getCell(1).font = TITLE_FONT;
  ws.addRow([]);

  const p = result.project || {};
  ws.addRow(['Address', p.address || '(not on plans)']);
  ws.addRow(['Lot / Plan', [p.lot, p.plan_number].filter(Boolean).join(' / ')]);
  ws.addRow(['Builder', p.builder || '']);
  ws.addRow(['Drawing rev', p.drawing_revision || p.drawing_number || '']);
  const er = result.energy_report || {};
  ws.addRow(['Energy report', er.present ? `${er.standard || 'present'} — ${er.star_rating || ''}★ CZ${er.climate_zone || ''}` : 'NOT SUPPLIED — measurements only']);
  ws.addRow([]);

  const head = ws.addRow(['Headline totals', 'Value', 'Source']);
  styleHeaderRow(head);

  const MB = "'Material Breakup'";
  const CE = 'Ceilings';
  const GA = "'Garage Internal'";

  const rows = [
    ['Brick + Hebel walls m²', { formula: `${MB}!F5` }, 'Material Breakup', M2],
    ['Lightweight walls m²', { formula: `${MB}!F6` }, 'Material Breakup', M2],
    ['  Brick m² (total)', { formula: `${MB}!F2` }, 'Material Breakup', M2],
    ['  Hebel m² (total)', { formula: `${MB}!F3` }, 'Material Breakup', M2],
    ['  Lightweight m² (ground)', { formula: `${MB}!B4` }, 'Material Breakup', M2],
    ['  Lightweight m² (first)', { formula: `${MB}!C4` }, 'Material Breakup', M2],
    ['Gables m² (all materials)', { formula: `SUM(${MB}!E2:E4)` }, 'Material Breakup', M2],
    ['Garage internal walls m²', { formula: `SUM(${GA}!F:F)` }, 'Garage Internal', M2],
    ['Ceiling insulated m²', { formula: `SUMIFS(${CE}!E:E,${CE}!G:G,"Yes")` }, 'Ceilings', M2],
    ['Ceiling gross m²', { formula: `SUM(${CE}!E:E)` }, 'Ceilings', M2],
  ];
  for (const [label, val, src, fmt] of rows) {
    const row = ws.addRow([label, val, src]);
    row.getCell(2).numFmt = fmt;
  }

  if (hasQuote) {
    const q = ws.addRow(['Quote total', { formula: 'SUMIF(Quote!F:F,"Quote total",Quote!G:G)' }, 'Quote']);
    q.getCell(2).numFmt = MONEY;
    q.font = { bold: true };
  } else {
    const q = ws.addRow(['Quote', 'Not priced (measurements only)', 'See Assumptions & Notes']);
    q.getCell(2).font = { italic: true };
  }
}

function buildAssumptions(ws, result, hasQuote) {
  setCols(ws, [16, 50, 30, 12]);
  const title = ws.addRow(['Assumptions, Flags & Scaled-vs-Labelled Notes']);
  title.getCell(1).font = TITLE_FONT;
  ws.addRow([]);

  const fh = ws.addRow(['Type', 'Message / Assumption', 'Basis / Location', 'Confidence']);
  styleHeaderRow(fh);

  for (const f of result.flags || []) {
    const row = ws.addRow([`FLAG (${f.severity || 'info'})`, f.message, f.location || '', '']);
    if ((f.severity || '').toLowerCase() !== 'info') row.eachCell((c) => (c.fill = FLAG_FILL));
  }
  for (const v of result.validation?.issues || []) {
    const action = result.issue_actions?.[v.id]?.status;
    const row = ws.addRow([
      `VALIDATION (${action || v.severity || 'warn'})`,
      v.message,
      [v.target?.section, v.target?.field, v.target?.index != null ? `row ${v.target.index + 1}` : null].filter(Boolean).join(' / '),
      '',
    ]);
    if (!action) row.eachCell((c) => (c.fill = FLAG_FILL));
  }
  for (const a of result.assumptions || []) {
    ws.addRow([`ASSUMPTION`, `${a.topic ? a.topic + ': ' : ''}${a.assumption}`, a.basis || '', a.confidence || '']);
  }
  for (const [key, value] of Object.entries(result.user_resolutions || {})) {
    if (value) ws.addRow(['USER INPUT', value, key, '']);
  }

  // List scaled (vs labelled) dimensions surfaced from measurements.
  const m = result.measurements;
  const scaled = [];
  for (const r of m.externalWalls.rows) {
    if ((r.source || '').toLowerCase() === 'scaled' || lowConfidence(r.confidence))
      scaled.push([`Wall: ${r.location} (${r.material}, ${r.level})`, r.source, r.confidence]);
  }
  for (const g of m.gables) {
    if (g.gable_height_source === 'computed_from_pitch' || (g.source || '').toLowerCase() === 'scaled')
      scaled.push([`Gable: ${g.location}`, g.gable_height_source === 'computed_from_pitch' ? 'height computed from pitch' : g.source, g.confidence]);
  }
  for (const c of m.ceilings) {
    if ((c.source || '').toLowerCase() === 'scaled' || lowConfidence(c.confidence))
      scaled.push([`Ceiling: ${c.area_type}`, c.source, c.confidence]);
  }
  if (scaled.length) {
    ws.addRow([]);
    const sh = ws.addRow(['SCALED / LOW-CONFIDENCE DIMENSIONS', '', '', '']);
    sh.getCell(1).font = { bold: true };
    for (const [what, src, conf] of scaled) {
      const row = ws.addRow(['scaled', what, src || '', conf || '']);
      row.eachCell((c) => (c.fill = FLAG_FILL));
    }
  }

  if (!hasQuote) {
    ws.addRow([]);
    const r = ws.addRow(['NOTE', 'No R-values known (no energy report and no manual spec). Quote tab omitted; R-value / Insulated cells are blank-but-editable. Fill them in to price.', 'global', '']);
    r.eachCell((c) => (c.fill = FLAG_FILL));
  }
}
