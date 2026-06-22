const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};
const normMaterial = (m) => {
  const s = (m || '').toLowerCase();
  if (s.includes('brick')) return 'brick';
  if (s.includes('hebel')) return 'hebel';
  return 'lightweight';
};
const normLevel = (l) => {
  const s = (l || '').toLowerCase();
  return s.includes('first') || s.includes('upper') || s.includes('1') ? 'first' : 'ground';
};
const normR = (r) => {
  if (!r) return null;
  const m = String(r).match(/R?\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? m[1] : null;
};

function issue(id, severity, message, target, fixHint, requiredInfo) {
  return { id, severity, message, target, fixHint, requiredInfo };
}

export function validateTakeoff(takeoff, measurements, quote) {
  const t = takeoff || {};
  const issues = [];

  for (const [i, wall] of (t.walls_external || []).entries()) {
    const h = num(wall.height_m);
    if (h > 0 && (h < 2.1 || h > 3.6)) {
      issues.push(
        issue(
          `wall-height-${i}`,
          'warn',
          `Wall height ${h}m looks outside the normal residential range.`,
          { section: 'walls_external', index: i, field: 'height_m', page: sourcePage(wall) },
          'Check the elevation/section and update height_m if needed.',
          'Confirm the correct wall height in metres for this wall row.'
        )
      );
    }
    if (!wall.length_m || !wall.height_m) {
      issues.push(
        issue(
          `wall-missing-dim-${i}`,
          'error',
          `External wall "${wall.location || i + 1}" is missing length or height.`,
          { section: 'walls_external', index: i, field: !wall.length_m ? 'length_m' : 'height_m', page: sourcePage(wall) },
          'Enter the labelled or measured dimension.',
          `Enter the missing ${!wall.length_m ? 'length' : 'height'} in metres.`
        )
      );
    }
  }

  const wallGroups = {};
  for (const wall of t.walls_external || []) {
    const key = `${normMaterial(wall.material)}|${normLevel(wall.level)}`;
    wallGroups[key] = (wallGroups[key] || 0) + num(wall.length_m) * num(wall.height_m);
  }
  const doorGroups = {};
  for (const [i, door] of (t.openings?.doors || []).entries()) {
    const area = num(door.height_m) * num(door.width_m);
    const key = `${normMaterial(door.in_material)}|${normLevel(door.level)}`;
    doorGroups[key] = (doorGroups[key] || 0) + area;
    if (!door.height_m || !door.width_m) {
      issues.push(
        issue(
          `door-missing-dim-${i}`,
          'error',
          `Door "${door.location || i + 1}" is missing height or width.`,
          { section: 'doors', index: i, field: !door.height_m ? 'height_m' : 'width_m', page: sourcePage(door) },
          'Enter the schedule size or decoded door-code size.',
          `Enter the missing door ${!door.height_m ? 'height' : 'width'} in metres.`
        )
      );
    }
  }
  for (const [key, doorArea] of Object.entries(doorGroups)) {
    const gross = wallGroups[key] || 0;
    if (doorArea > gross && doorArea > 0) {
      issues.push(
        issue(
          `doors-over-wall-${key}`,
          'error',
          `Door deductions (${round2(doorArea)}m2) exceed gross wall area (${round2(gross)}m2) for ${key.replace('|', ' ')}.`,
          { section: 'doors', page: null },
          'Check door material/level assignments or wall segment dimensions.',
          'Confirm each door is assigned to the correct wall material and level, or correct the wall dimensions.'
        )
      );
    }
  }

  const ceilingGross = measurements?.summary?.ceiling_gross_m2 || 0;
  const wallGross = Object.values(wallGroups).reduce((s, v) => s + v, 0);
  if (ceilingGross > 0 && wallGross > 0) {
    const ratio = ceilingGross / wallGross;
    if (ratio < 0.45 || ratio > 2.4) {
      issues.push(
        issue(
          'ceiling-wall-ratio',
          'warn',
          `Ceiling gross area (${round2(ceilingGross)}m2) looks unusual compared with gross wall area (${round2(wallGross)}m2).`,
          { section: 'ceilings', page: null },
          'Check that ceiling areas came from the correct area schedule and that wall lengths are complete.',
          'Confirm ceiling area schedule values and whether any wall rows are missing.'
        )
      );
    }
  }

  const reqs = t.energy_report?.requirements || [];
  const seenReqs = new Map();
  for (const [i, req] of reqs.entries()) {
    const key = `${(req.element || '').toLowerCase()}|${(req.location || '').toLowerCase()}`;
    const r = normR(req.r_value);
    if (!r) {
      issues.push(
        issue(
          `missing-r-${i}`,
          'warn',
          `Energy requirement "${req.element || i + 1}" has no R-value.`,
          { section: 'energy_requirements', index: i, field: 'r_value', page: sourcePage(req) },
          'Enter the R-value from the EE report.',
          'Enter the required R-value, for example R2.0 or R3.5.'
        )
      );
    }
    if (seenReqs.has(key) && seenReqs.get(key) !== r) {
      issues.push(
        issue(
          `conflicting-r-${i}`,
          'error',
          `Duplicate/conflicting R-values for ${req.element || 'requirement'} ${req.location || ''}.`,
          { section: 'energy_requirements', index: i, field: 'r_value', page: sourcePage(req) },
          'Keep the correct requirement or clarify the location/zone.',
          'Choose the correct R-value or separate the requirements by location/zone.'
        )
      );
    }
    if (key.trim() !== '|') seenReqs.set(key, r);
  }

  const hasFirst = (t.walls_external || []).some((w) => normLevel(w.level) === 'first');
  const hasGround = (t.walls_external || []).some((w) => normLevel(w.level) === 'ground');
  if (hasFirst && !hasGround) {
    issues.push(
      issue(
        'first-without-ground',
        'warn',
        'First-floor wall rows exist but no ground-floor wall rows were extracted.',
        { section: 'walls_external', page: null },
        'Confirm whether the ground-floor external walls are missing.',
        'Confirm whether this job has ground-floor external wall rows; add them if missing.'
      )
    );
  }

  if (quote?.lines?.length) {
    for (const line of quote.lines) {
      if (line.line_cost == null) {
        issues.push(
          issue(
            `quote-unpriced-${line.id}`,
            'error',
            `Quote line "${line.label}" is missing product or rates.`,
            { section: 'quote', field: line.id, page: null },
            'Select a product or enter both supply and install rates.',
            'Select a matching product or enter both supply and install rates in Rates & Quote.'
          )
        );
      }
    }
  }

  return {
    issues,
    hasErrors: issues.some((i) => i.severity === 'error'),
    hasWarnings: issues.some((i) => i.severity === 'warn'),
  };
}

function sourcePage(row) {
  return row?.source_ref?.page || row?.source_page || null;
}
