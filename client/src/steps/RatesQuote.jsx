import { useState } from 'react';
import { api } from '../lib/api.js';
import { Card, Banner } from '../components/ui.jsx';

const money = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);
const n2 = (v) => (v == null || isNaN(v) ? '' : Number(v).toFixed(2));

export default function RatesQuote({ pricing, setPricing, computed, products, builders, builderMatch, onBack, onNext }) {
  const [saveMsg, setSaveMsg] = useState(null);
  const mode = pricing.mode;
  const setMode = (m) => setPricing({ ...pricing, mode: m });
  const quote = computed?.quote;
  const haveR = computed?.meta?.have_r_values;

  const setLineOverride = (lineId, patch) => {
    setPricing({
      ...pricing,
      lineOverrides: { ...pricing.lineOverrides, [lineId]: { ...(pricing.lineOverrides?.[lineId] || {}), ...patch } },
    });
  };

  const activeBuilder = builders.find((b) => b.id === pricing.builderId);

  const saveToBuilder = async () => {
    if (!activeBuilder || !quote) return;
    setSaveMsg('Saving…');
    try {
      for (const l of quote.lines) {
        if (l.product && l.supply_rate != null && l.install_rate != null) {
          await api.setBuilderRate(activeBuilder.id, l.product.id, { supply_rate: l.supply_rate, install_rate: l.install_rate });
        }
      }
      setSaveMsg(`Saved rates to ${activeBuilder.name}`);
    } catch (e) {
      setSaveMsg('Save failed: ' + e.message);
    }
  };

  return (
    <div className="space-y-5">
      <Card title="How do you want to price this job?">
        <div className="grid gap-3 sm:grid-cols-3">
          <ModeCard
            active={mode === 'auto'}
            onClick={() => setMode('auto')}
            title="Price it (auto)"
            desc="Map each line to a price-list product by category + R-value and apply rates."
          />
          <ModeCard
            active={mode === 'manual'}
            onClick={() => setMode('manual')}
            title="Price manually"
            desc="Assign a product and/or type a rate per line by hand. Works with or without a report."
          />
          <ModeCard
            active={mode === 'none'}
            onClick={() => setMode('none')}
            title="Measurements only"
            desc="Skip pricing. Export the measurement workbook with blank, editable rate cells."
          />
        </div>
      </Card>

      {mode === 'none' && (
        <Card title="Measurements only">
          <Banner tone="info" title="No quote will be generated">
            The workbook will render all measurement tabs with R-value/Insulated and Quote left blank-but-editable.
          </Banner>
          <div className="mt-4 flex justify-between">
            <button className="btn-ghost" onClick={onBack}>← Back</button>
            <button className="btn-primary" onClick={onNext}>Export measurements only →</button>
          </div>
        </Card>
      )}

      {mode === 'auto' && (
        <Card title="Builder rates" subtitle="Matched builder's rates auto-apply; unmatched products fall back to defaults.">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-600">Builder profile:</label>
            <select
              className="input max-w-xs"
              value={pricing.builderId ?? ''}
              onChange={(e) => setPricing({ ...pricing, builderId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">— Use default rates —</option>
              {builders.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {builderMatch?.matched && pricing.builderId === builderMatch.builderId && (
              <span className="text-sm text-green-700">✓ Matched: {builderMatch.builderName} — using saved rates</span>
            )}
            {pricing.builderId && (
              <button className="btn-ghost" onClick={() => setPricing({ ...pricing, builderId: null })}>
                Use default rates instead
              </button>
            )}
            {activeBuilder && (
              <button className="btn-ghost" onClick={saveToBuilder}>Save to builder profile</button>
            )}
            {saveMsg && <span className="text-sm text-gray-500">{saveMsg}</span>}
          </div>
          {builderMatch?.matched && pricing.builderId !== builderMatch.builderId && (
            <p className="mt-2 text-sm text-amber-700">
              Extraction matched <strong>{builderMatch.builderName}</strong>.{' '}
              <button className="underline" onClick={() => setPricing({ ...pricing, builderId: builderMatch.builderId })}>
                Use {builderMatch.builderName}'s rates
              </button>
            </p>
          )}
        </Card>
      )}

      {(mode === 'auto' || mode === 'manual') && (
        <Card
          title="Quote lines"
          subtitle="Each take-off line, matched to a product + rate. Edit product, rates, or R-value per line — totals recompute live."
        >
          {!haveR && mode === 'auto' && (
            <div className="mb-4">
              <Banner tone="warn" title="No R-values known">
                Add R-values in Review (energy requirements), or switch to manual pricing to set a product/rate per line.
              </Banner>
            </div>
          )}
          {!quote ? (
            <p className="text-sm text-gray-400">No quote computed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="th">Line</th>
                    <th className="th">Product</th>
                    <th className="th w-20">R-value</th>
                    <th className="th w-20 text-right">Qty</th>
                    <th className="th w-20 text-right" title="Extra material ordered for cuts/offcuts — applied to supply cost only">Wastage %</th>
                    <th className="th w-28 text-right">Supply $</th>
                    <th className="th w-28 text-right">Install $</th>
                    <th className="th w-24 text-right">Line $</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lines.map((l) => {
                    const ov = pricing.lineOverrides?.[l.id] || {};
                    return (
                      <tr key={l.id} className={l.flagged ? 'bg-amber-50' : ''}>
                        <td className="td">{l.label}</td>
                        <td className="td">
                          <select
                            className="cell-input"
                            value={ov.product_id ?? l.product?.id ?? ''}
                            onChange={(e) => setLineOverride(l.id, { product_id: e.target.value ? Number(e.target.value) : null })}
                          >
                            <option value="">— unmatched —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="td">
                          <input
                            className="cell-input w-16"
                            value={ov.r_value ?? l.r_value ?? ''}
                            onChange={(e) => setLineOverride(l.id, { r_value: e.target.value })}
                          />
                        </td>
                        <td className="td text-right tabular-nums">
                          {n2(l.qty)} <span className="text-gray-400">{l.unit === 'lm' ? 'lm' : 'm²'}</span>
                          {l.supply_qty > l.qty && (
                            <div className="text-xs text-gray-400">order {n2(l.supply_qty)}</div>
                          )}
                        </td>
                        <td className="td">
                          <input
                            type="number" step="any"
                            className="cell-input text-right tabular-nums"
                            value={ov.wastage_pct ?? l.wastage_pct ?? 0}
                            onChange={(e) => setLineOverride(l.id, { wastage_pct: e.target.value === '' ? null : Number(e.target.value) })}
                          />
                        </td>
                        <td className="td">
                          <input
                            type="number" step="any"
                            className="cell-input text-right tabular-nums"
                            value={ov.supply_rate ?? l.supply_rate ?? ''}
                            onChange={(e) => setLineOverride(l.id, { supply_rate: e.target.value === '' ? null : Number(e.target.value) })}
                          />
                        </td>
                        <td className="td">
                          <input
                            type="number" step="any"
                            className="cell-input text-right tabular-nums"
                            value={ov.install_rate ?? l.install_rate ?? ''}
                            onChange={(e) => setLineOverride(l.id, { install_rate: e.target.value === '' ? null : Number(e.target.value) })}
                          />
                        </td>
                        <td className="td text-right font-semibold tabular-nums">{money(l.line_cost)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2">
                    <td className="td font-bold" colSpan={7}>Quote total</td>
                    <td className="td text-right text-base font-bold tabular-nums">{money(quote.total)}</td>
                  </tr>
                </tbody>
              </table>
              {quote.anyUnpriced && (
                <p className="mt-3 text-sm text-amber-700">⚠ Some lines are unpriced (no product/rate). Assign one or they export blank.</p>
              )}
            </div>
          )}
          <div className="mt-5 flex justify-between">
            <button className="btn-ghost" onClick={onBack}>← Back</button>
            <button className="btn-primary" onClick={onNext}>Export →</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function ModeCard({ active, onClick, title, desc }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 p-4 text-left transition ${active ? 'border-accent bg-accent/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-4 w-4 items-center justify-center rounded-full ${active ? 'bg-accent' : 'ring-1 ring-gray-300'}`}>
          {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </span>
        <span className="font-semibold text-gray-900">{title}</span>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">{desc}</p>
    </button>
  );
}
