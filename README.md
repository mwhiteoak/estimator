# Estimator

A local insulation take-off and quoting app for residential building plans.

It reads architectural plans and an optional energy-efficiency report, extracts the insulation-related data, lets the user review and correct it, then exports a formula-driven Excel workbook.

## What It Does

- Upload architectural plans PDF.
- Optionally upload an energy-efficiency report PDF.
- Before extraction runs, cheaply checks that the plans and energy report describe the same
  property address, and flags a probable wrong-file-pair upload.
- Extract project details, builder, address, wall sections, doors, gables, ceilings, wall/subfloor
  wrap, continuous sealing items, and insulation requirements.
- Show extraction progress and preview findings while it works.
- Let the user review, edit, resolve, or ignore flagged issues.
- Calculate take-off quantities with deterministic code — including a cladding-area fallback for
  wrap requirements the AI identifies but can't independently re-measure.
- Match products/rates, apply a per-product wastage/overage allowance to the material ordered, and
  build a quote.
- Export an Excel workbook with formulas, assumptions, validation notes, and source references.

## How It Works

The app has two layers:

1. **AI extraction**
   Claude reads PDFs and returns structured raw data. It does not do the take-off maths.

2. **Deterministic calculation**
   The server code calculates wall areas, door deductions, gables, ceilings, wall/subfloor wrap,
   continuous items, material breakups, pricing, validation warnings, and Excel formulas.

This keeps the maths auditable and testable.

## Estimator-Style Checks

A few things a human estimator would instinctively double-check are built in rather than left to
the AI's first read:

- **Address pre-check** — flags it if the plans and energy report look like they're for different
  properties, before burning the full extraction pass on a mismatched pair.
- **Area schedule cross-check** — if the site plan carries its own Area Schedule table (Ground
  Floor / First Floor / Garage / Alfresco / Porch / Total), the computed ceiling gross area is
  compared against it and flagged if they diverge by more than ~15%.
- **Wrap-from-cladding fallback** — a wrap requirement scoped to "cladded external walls" is priced
  against the already-measured lightweight/cladding wall area for that level when the AI can't
  independently re-measure it, instead of silently pricing zero.
- **Wastage / overage allowance** — each product carries a wastage % (10% is the default for batts,
  5% for wrap/sarking/sealant) applied to the material ordered, not the installation labour, editable
  per product or per quote line.
- Missing-dimension checks across walls, doors, gables, garage walls, wrap, and continuous items —
  gaps are flagged for the user rather than silently priced at zero.

## App Flow

```text
Upload -> Extract -> Review & Edit -> Rates & Quote -> Export
```

During review, the user can:

- edit extracted quantities;
- inspect source page references;
- view the uploaded plan beside the data;
- resolve or ignore review items;
- rerun live calculations automatically as values change.

## Run Locally

Use Node 20:

```bash
nvm use
```

Install dependencies:

```bash
npm run setup
```

Start the backend:

```bash
npm run dev:server
```

Start the frontend in a second terminal:

```bash
npm run dev:client
```

Open:

```text
http://localhost:5173
```

The API runs at:

```text
http://localhost:5174
```

## API Key

Add your Anthropic API key in the app Settings screen.

The key is stored locally in:

```text
server/config.json
```

That file is ignored by git and should never be committed.

## Tests

Run server unit tests:

```bash
cd server
npm test
```

Run the smoke workbook test:

```bash
cd server
node test/smoke.mjs
```

## Project Structure

```text
client/   React + Vite frontend
server/   Express API, extraction, calculations, Excel export, SQLite data
fixtures/ Notes for test cases
```

## Local Data

The app stores local price lists, builders, and saved jobs in SQLite under `server/db/`.

Local runtime files are ignored by git:

- `server/config.json`
- `server/db/*.db`
- `node_modules/`
- `client/dist/`
- generated test exports
