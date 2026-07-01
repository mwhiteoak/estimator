// Fuzzy-compare the site address read off the plans against the one read off
// the energy report, so a mismatched pair of uploads can be flagged before
// the (expensive) full extraction runs.

const ABBREV = {
  st: 'street', rd: 'road', ave: 'avenue', av: 'avenue', dr: 'drive', ct: 'court',
  cres: 'crescent', pde: 'parade', pl: 'place', tce: 'terrace', hwy: 'highway',
  cl: 'close', blvd: 'boulevard', ln: 'lane', gr: 'grove', cct: 'circuit', sq: 'square',
};

function normalise(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => ABBREV[w] || w)
    .join(' ')
    .trim();
}

function tokens(s) {
  return new Set(normalise(s).split(' ').filter(Boolean));
}

function tokenOverlap(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

// Returns { status: 'match' | 'mismatch' | 'unknown', score }.
// 'unknown' means at least one address couldn't be read, so we genuinely
// can't confirm the two documents describe the same property.
export function compareAddresses(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return { status: 'unknown', score: 0 };
  if (na === nb) return { status: 'match', score: 1 };
  if (na.includes(nb) || nb.includes(na)) return { status: 'match', score: 0.9 };
  const score = tokenOverlap(a, b);
  return { status: score >= 0.6 ? 'match' : 'mismatch', score };
}
