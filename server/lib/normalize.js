// Shared normalization/rounding helpers used by both compute.js (quote math)
// and validation.js (review warnings) — kept in one place so the two never
// silently disagree on what counts as "brick" or "ground floor".

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

export function normMaterial(m) {
  const s = (m || '').toLowerCase();
  if (s.includes('brick')) return 'brick';
  if (s.includes('hebel')) return 'hebel';
  return 'lightweight';
}

export function normLevel(l) {
  const s = (l || '').toLowerCase();
  return s.includes('first') || s.includes('upper') || s.includes('1') ? 'first' : 'ground';
}

// Wrap/sarking items span more locations than walls do (subfloor, gable ends),
// so this is a separate bucket set rather than an extension of normLevel.
export function normWrapLevel(l) {
  const s = (l || '').toLowerCase();
  if (s.includes('subfloor') || s.includes('sub-floor') || s.includes('under')) return 'subfloor';
  if (s.includes('gable')) return 'gable';
  if (s.includes('first') || s.includes('upper') || s.includes('1')) return 'first';
  return 'ground';
}

export function normR(r) {
  if (!r) return null;
  const m = String(r).match(/R?\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? m[1] : null;
}
