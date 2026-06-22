# Insulation Take-Off

A local, single-user app that turns architectural plans + an (optional) energy report into a priced
insulation take-off, exported as a formula-driven Excel workbook.

**Two layers, by design:**
1. **AI extraction** — Claude reads the PDFs and returns *raw structured data only* (dimensions,
   materials, R-values, flags). It does no arithmetic.
2. **Deterministic code** — all area maths, door deductions, gable geometry, material grouping, rate
   application and Excel formula generation happen in `server/lib/compute.js` + `excel.js`.

Measurements and spec are **decoupled**: you always get a complete measurement workbook from the plans
alone. The R-value/quote overlay only appears when an energy report is present *or* you type R-values
in manually.

---

## Requirements

- **Node.js 18+** (built and tested on Node 20). Your machine's default `node` may be older — this
  repo pins Node 20 via `.nvmrc`:
  ```bash
  nvm use      # picks up .nvmrc -> Node 20
  ```
- An Anthropic API key (entered in-app via Settings, or via the `ANTHROPIC_API_KEY` env var).

## Setup

```bash
nvm use
npm run setup        # installs server + client deps (builds the native better-sqlite3 module)
```

On first run the server seeds an illustrative price list + two sample builder profiles
(Avia Homes, Hancock Homes) into a local SQLite DB. **Seeded rates are placeholders — replace them
with your real rates** in the Price List tab.

## Run

**Dev (two terminals, hot reload):**
```bash
npm run dev:server   # http://localhost:5174  (API)
npm run dev:client   # http://localhost:5173  (UI, proxies /api -> 5174)
```
Open **http://localhost:5173**.

**Single-process (production-style):**
```bash
npm run build        # builds the client into client/dist
npm start            # server serves the built UI + API on http://localhost:5174
```

## API key

Open **⚙ Settings** in the app and paste your Anthropic key. It is POSTed to `/api/settings` and
stored **server-side** in `server/config.json` (gitignored) — it is never shipped to the browser or
kept in localStorage. You can also `ANTHROPIC_API_KEY=sk-ant-… npm start` for a one-off.

> **Never commit `server/config.json`.** The key lives locally only. `.gitignore` already excludes it,
> the SQLite DB, `node_modules`, and `client/dist`.

## The flow

`Upload → Extract → Review & Edit → Rates & Quote → Export`

1. **Upload** — plans PDF (required) + energy report PDF (optional).
2. **Extract** — Claude returns the structured take-off JSON (raw output is surfaced if it isn't valid
   JSON, rather than crashing).
3. **Review & Edit** — every figure is editable in inline tables; low-confidence/scaled rows are
   tinted amber; totals recompute live as you type.
4. **Rates & Quote** — choose **Price it (auto)**, **Price manually**, or **Measurements only**. The
   matched builder's rates auto-apply (with one-click revert to defaults and "Save to builder
   profile"). Skippable.
5. **Export** — formula-driven `.xlsx` named after the address (or drawing/job number), one tab per
   section + Summary + Assumptions & Notes. Optionally save the job to reload later without re-running
   the AI.

## Excel output

Filename: `<Address> - Insulation Take-Off.xlsx`. Tabs: **Summary** (cross-sheet `SUMIFS`/refs, never
hard-typed), **External Walls** (`Gross =L×H`, `Net =Gross−DoorDeduction`; doors deducted at the
material×level group level as their own rows), **Material Breakup** (`SUMIFS` matrix), **Gables**
(`height =(base/2)·tan(pitch)`, `area =½·base·height`), **Garage Internal**, **Ceilings**, **Quote**
(conditional; `Line $ =Net×(Supply+Install)`), and **Assumptions & Notes** (every assumption, every
scaled-vs-labelled dimension, every flag — gaps surfaced, never silently filled).

## Project layout

```
server/   Express API — extract (Anthropic), takeoff (compute), export (ExcelJS), CRUD, SQLite
client/   React + Vite + Tailwind card UI
fixtures/ test-case notes (see fixtures/README.md)
```

## Smoke test (no AI needed)

```bash
cd server && node test/smoke.mjs
```
Runs the two fixtures through `compute.js` + `excel.js` and writes workbooks to `server/test/out/`.
