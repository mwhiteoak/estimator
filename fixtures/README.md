# Test fixtures

Drop the two source PDFs here to exercise both paths end-to-end. Filenames are suggestions; upload
whatever you have via the Upload screen.

## A. 130A Passage Street, Cleveland QLD 4163 — Avia Homes (energy report PRESENT)

- `130A-Passage-St-plans.pdf`
- `130A-Passage-St-energy-report.pdf` (InsulHome BERS)

Exercises: full energy report with a detailed external **wall schedule** (H×W per orientation →
`source="labelled"`), ceiling/alfresco R-values, zero-boundary **R1.7 fire-batt special wall**,
predominantly **lightweight** cladding (Scyon linea), two-storey ceilings, area schedule present.
Builder **Avia Homes** fuzzy-matches the seeded profile (auto rates apply).

## B. 27 Torres Way, Spring Mountain QLD 4300 — Hancock Homes (NO energy report)

- `27-Torres-Way-plans.pdf`

Exercises: **plans-only** path (energy report absent → flags, measurements-only), **mixed façade**
(common-brick render + Axon vertical cladding + NRG EPS + fibre-cement → real brick-vs-lightweight
breakup), BTB boundary wall. Builder **Hancock Homes** (seeded). Address present, lot 8576.

Use **A** to validate energy-report parsing + the wall-schedule shortcut; use **B** to validate the
plans-only fallback and the brick-vs-lightweight split.

> No PDFs are committed here — add your own. `server/test/smoke.mjs` covers the compute + Excel layers
> with inline fixture data so you can verify maths/formatting without the source documents or an API key.
