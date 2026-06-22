// Fuzzy-match an extracted builder name against stored builders + their aliases.
// Returns { builder, score, reason } or null. Conservative: only matches on a
// normalised exact/contains/token-overlap basis, never a wild guess.

function normalise(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\b(pty|ltd|limited|australia|homes?|group|constructions?|builders?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
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

export function matchBuilder(extractedName, builders) {
  if (!extractedName) return null;
  const target = extractedName.trim();
  let best = null;

  for (const b of builders) {
    let aliases = [];
    try {
      aliases = b.aliases ? JSON.parse(b.aliases) : [];
    } catch {
      aliases = [];
    }
    const candidates = [b.name, ...aliases];

    for (const cand of candidates) {
      const nTarget = normalise(target);
      const nCand = normalise(cand);
      let score = 0;
      let reason = '';

      if (nTarget && nTarget === nCand) {
        score = 1;
        reason = 'exact match';
      } else if (nTarget && nCand && (nTarget.includes(nCand) || nCand.includes(nTarget))) {
        score = 0.9;
        reason = 'name contained';
      } else {
        score = tokenOverlap(target, cand) * 0.8;
        reason = 'token overlap';
      }

      if (!best || score > best.score) {
        best = { builder: b, score, reason, matchedOn: cand };
      }
    }
  }

  if (best && best.score >= 0.5) return best;
  return null;
}
