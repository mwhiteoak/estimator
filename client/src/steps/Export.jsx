import { useState } from 'react';
import { api } from '../lib/api.js';
import { Card, Banner } from '../components/ui.jsx';

const n2 = (v) => (v == null || isNaN(v) ? '0.00' : Number(v).toFixed(2));

export default function Export({ takeoff, pricing, computed, onBack }) {
  const [downloading, setDownloading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState(null);
  const s = computed?.measurements?.summary;
  const quote = computed?.quote;
  const quoteTotal = quote?.total == null ? 'Incomplete' : `$${Number(quote.total).toFixed(2)}`;

  const doExport = async () => {
    setDownloading(true);
    setMsg(null);
    try {
      const filename = await api.exportXlsx(takeoff, pricing.mode === 'none' ? { mode: 'none' } : pricing);
      setMsg(`Downloaded: ${filename}`);
    } catch (e) {
      setMsg('Export failed: ' + e.message);
    } finally {
      setDownloading(false);
    }
  };

  const saveJob = async () => {
    try {
      await api.saveJob({
        name: takeoff.project?.address || takeoff.project?.drawing_number || 'Untitled job',
        address: takeoff.project?.address || '',
        builder: takeoff.project?.builder || '',
        takeoff,
        pricing,
        totals: computed,
      });
      setSaved(true);
    } catch (e) {
      setMsg('Save failed: ' + e.message);
    }
  };

  return (
    <Card title="Export" subtitle="Formula-driven Excel workbook, one tab per section + Summary + Assumptions.">
      <div className="grid gap-2 sm:grid-cols-2">
        <Stat label="Brick + Hebel walls" v={`${n2(s?.brick_hebel_m2)} m²`} />
        <Stat label="Lightweight walls" v={`${n2(s?.lightweight_m2)} m²`} />
        <Stat label="Gables" v={`${n2(s?.gables_m2)} m²`} />
        <Stat label="Garage internal" v={`${n2(s?.garage_internal_m2)} m²`} />
        <Stat label="Ceiling insulated" v={`${n2(s?.ceiling_insulated_m2)} m²`} />
        <Stat label="Quote total" v={quote ? quoteTotal : 'Measurements only'} highlight />
      </div>

      {!quote && (
        <div className="mt-4">
          <Banner tone="info" title="Measurements-only workbook">
            R-value / Insulated and the Quote tab will render blank-but-editable. A note is added to the Assumptions tab.
          </Banner>
        </div>
      )}

      {msg && (
        <div className="mt-4">
          <Banner tone={msg.startsWith('Downloaded') ? 'success' : 'error'}>{msg}</Banner>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={saveJob} disabled={saved}>
            {saved ? '✓ Job saved' : 'Save job'}
          </button>
          <button className="btn-primary" onClick={doExport} disabled={downloading}>
            {downloading ? 'Generating…' : '⬇ Download .xlsx'}
          </button>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, v, highlight }) {
  return (
    <div className={`rounded-xl px-4 py-3 ring-1 ${highlight ? 'bg-accent/5 ring-accent/20' : 'bg-gray-50 ring-gray-100'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${highlight ? 'text-accent' : 'text-gray-900'}`}>{v}</div>
    </div>
  );
}
