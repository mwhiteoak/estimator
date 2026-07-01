import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Banner } from './ui.jsx';

export default function ManageModal({ tab: initialTab, onClose, onData, onLoadJob, onLoadTemplate }) {
  const [tab, setTab] = useState(initialTab || 'settings');
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex gap-1">
            {[
              ['settings', 'Settings'],
              ['products', 'Price List'],
              ['builders', 'Builders'],
              ['jobs', 'Saved Jobs'],
              ['templates', 'House Templates'],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-6">
          {tab === 'settings' && <SettingsTab onData={onData} />}
          {tab === 'products' && <ProductsTab onData={onData} />}
          {tab === 'builders' && <BuildersTab onData={onData} />}
          {tab === 'jobs' && <JobsTab onLoadJob={onLoadJob} onClose={onClose} />}
          {tab === 'templates' && <TemplatesTab onLoadTemplate={onLoadTemplate} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ onData }) {
  const [s, setS] = useState(null);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState(null);
  const load = () => api.getSettings().then(setS);
  useEffect(() => { load(); }, []);

  const save = async () => {
    const patch = { model: s.model, energyModel: s.energyModel, currency: s.currency };
    if (key.trim()) patch.apiKey = key.trim();
    const updated = await api.saveSettings(patch);
    setS({ ...s, ...updated });
    setKey('');
    setMsg('Saved');
    onData?.();
  };

  if (!s) return <p className="text-sm text-gray-400">Loading…</p>;
  return (
    <div className="max-w-lg space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Anthropic API key</label>
        <input
          type="password"
          className="input"
          placeholder={s.hasApiKey ? `•••• stored (…${s.apiKeyLast4}, source: ${s.apiKeySource})` : 'sk-ant-…'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-400">Stored server-side in config.json (gitignored). Never sent to the browser.</p>
        {s.hasApiKey && (
          <button className="mt-2 text-xs text-red-600 hover:underline" onClick={async () => { await api.clearKey(); load(); }}>
            Clear stored key
          </button>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Plans model (geometry pass)</label>
        <select className="input" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })}>
          {s.availableModels?.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400">Reads the drawings & measures up. Use the most capable model here.</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Energy-report model (fast distillation pass)</label>
        <select className="input" value={s.energyModel} onChange={(e) => setS({ ...s, energyModel: e.target.value })}>
          {s.availableModels?.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400">Long NatHERS/BERS reports are distilled to just the insulation requirements — a faster model keeps this cheap.</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
        <input className="input max-w-[120px]" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save}>Save settings</button>
        {msg && <span className="text-sm text-green-600">{msg}</span>}
      </div>
    </div>
  );
}

const BLANK_PRODUCT = { code: '', name: '', category: 'external_wall', unit: 'm2', default_supply_rate: 0, default_install_rate: 0, wastage_pct: 10, notes: '' };
const CATEGORIES = ['external_wall', 'garage_wall', 'ceiling', 'ceiling_outdoor', 'special_wall', 'acoustic', 'wall_wrap', 'subfloor_wrap', 'sealant', 'roof_sarking'];

function ProductsTab({ onData }) {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(BLANK_PRODUCT);
  const load = () => api.listProducts(true).then(setRows);
  useEffect(() => { load(); }, []);

  const update = async (id, patch) => { await api.updateProduct(id, patch); load(); onData?.(); };
  const add = async () => { if (!draft.name) return; await api.createProduct(draft); setDraft(BLANK_PRODUCT); load(); onData?.(); };
  const del = async (id) => { await api.deleteProduct(id); load(); onData?.(); };

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">Editable price list. Rates are placeholders — replace with yours. Soft-delete hides a product (active=0).</p>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="th">Code</th><th className="th">Name</th><th className="th">Category</th><th className="th">Unit</th>
              <th className="th text-right">Supply $</th><th className="th text-right">Install $</th><th className="th text-right">Wastage %</th>
              <th className="th">Active</th><th className="th" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'opacity-40'}>
                <td className="td"><input className="cell-input w-28" defaultValue={p.code} onBlur={(e) => update(p.id, { code: e.target.value })} /></td>
                <td className="td"><input className="cell-input min-w-[180px]" defaultValue={p.name} onBlur={(e) => update(p.id, { name: e.target.value })} /></td>
                <td className="td">
                  <select className="cell-input" defaultValue={p.category} onChange={(e) => update(p.id, { category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td className="td">
                  <select className="cell-input w-16" defaultValue={p.unit || 'm2'} onChange={(e) => update(p.id, { unit: e.target.value })}>
                    <option value="m2">m²</option>
                    <option value="lm">lm</option>
                  </select>
                </td>
                <td className="td"><input type="number" step="any" className="cell-input w-20 text-right" defaultValue={p.default_supply_rate} onBlur={(e) => update(p.id, { default_supply_rate: Number(e.target.value) })} /></td>
                <td className="td"><input type="number" step="any" className="cell-input w-20 text-right" defaultValue={p.default_install_rate} onBlur={(e) => update(p.id, { default_install_rate: Number(e.target.value) })} /></td>
                <td className="td"><input type="number" step="any" className="cell-input w-16 text-right" defaultValue={p.wastage_pct || 0} title="Extra material ordered for cuts/offcuts — applied to supply cost only" onBlur={(e) => update(p.id, { wastage_pct: Number(e.target.value) })} /></td>
                <td className="td">
                  <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={!!p.active} onChange={(e) => update(p.id, { active: e.target.checked ? 1 : 0 })} />
                </td>
                <td className="td text-right"><button className="text-gray-300 hover:text-red-500" onClick={() => del(p.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 rounded-xl bg-gray-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Add product</p>
        <div className="flex flex-wrap items-end gap-2">
          <Mini label="Code"><input className="input w-28" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></Mini>
          <Mini label="Name"><input className="input w-48" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Mini>
          <Mini label="Category">
            <select className="input w-40" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Mini>
          <Mini label="Unit">
            <select className="input w-20" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
              <option value="m2">m²</option>
              <option value="lm">lm</option>
            </select>
          </Mini>
          <Mini label="Supply $"><input type="number" step="any" className="input w-24" value={draft.default_supply_rate} onChange={(e) => setDraft({ ...draft, default_supply_rate: Number(e.target.value) })} /></Mini>
          <Mini label="Install $"><input type="number" step="any" className="input w-24" value={draft.default_install_rate} onChange={(e) => setDraft({ ...draft, default_install_rate: Number(e.target.value) })} /></Mini>
          <Mini label="Wastage %"><input type="number" step="any" className="input w-20" value={draft.wastage_pct} onChange={(e) => setDraft({ ...draft, wastage_pct: Number(e.target.value) })} /></Mini>
          <button className="btn-primary" onClick={add}>Add</button>
        </div>
      </div>
    </div>
  );
}

function BuildersTab({ onData }) {
  const [builders, setBuilders] = useState([]);
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState(null);
  const load = () => Promise.all([api.listBuilders(), api.listProducts()]).then(([b, p]) => { setBuilders(b); setProducts(p); });
  useEffect(() => { load(); }, []);

  const add = async () => { if (!name) return; await api.createBuilder({ name, aliases: [] }); setName(''); load(); onData?.(); };
  const del = async (id) => { await api.deleteBuilder(id); load(); onData?.(); };
  const setRate = async (bid, pid, patch) => { await api.setBuilderRate(bid, pid, patch); load(); };
  const clearRate = async (bid, pid) => { await api.clearBuilderRate(bid, pid); load(); };

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">Builder profiles. Add per-product rate overrides; anything not overridden falls back to the product default.</p>
      <div className="space-y-2">
        {builders.map((b) => {
          const rateMap = Object.fromEntries((b.rates || []).map((r) => [r.product_id, r]));
          return (
            <div key={b.id} className="rounded-xl ring-1 ring-gray-100">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <button className="font-semibold text-gray-900" onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                    {expanded === b.id ? '▾' : '▸'} {b.name}
                  </button>
                  <span className="ml-2 text-xs text-gray-400">{(b.rates || []).length} overrides</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="input w-72 text-xs"
                    defaultValue={(() => { try { return (JSON.parse(b.aliases || '[]')).join(', '); } catch { return ''; } })()}
                    placeholder="aliases, comma-separated"
                    onBlur={(e) => api.updateBuilder(b.id, { aliases: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }).then(load)}
                  />
                  <button className="btn-danger" onClick={() => del(b.id)}>Delete</button>
                </div>
              </div>
              {expanded === b.id && (
                <div className="border-t px-4 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr><th className="th">Product</th><th className="th">Default S/I</th><th className="th">Override Supply</th><th className="th">Override Install</th><th className="th" /></tr>
                    </thead>
                    <tbody>
                      {products.map((p) => {
                        const r = rateMap[p.id];
                        return (
                          <tr key={p.id}>
                            <td className="td">{p.code}</td>
                            <td className="td text-xs text-gray-400">{p.default_supply_rate}/{p.default_install_rate}</td>
                            <td className="td"><input type="number" step="any" className="cell-input w-20" defaultValue={r?.supply_rate ?? ''} placeholder="—" onBlur={(e) => e.target.value !== '' && setRate(b.id, p.id, { supply_rate: Number(e.target.value) })} /></td>
                            <td className="td"><input type="number" step="any" className="cell-input w-20" defaultValue={r?.install_rate ?? ''} placeholder="—" onBlur={(e) => e.target.value !== '' && setRate(b.id, p.id, { install_rate: Number(e.target.value) })} /></td>
                            <td className="td">{r && <button className="text-xs text-gray-400 hover:text-red-500" onClick={() => clearRate(b.id, p.id)}>clear</button>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <Mini label="New builder name"><input className="input w-64" value={name} onChange={(e) => setName(e.target.value)} /></Mini>
        <button className="btn-primary" onClick={add}>Add builder</button>
      </div>
    </div>
  );
}

function JobsTab({ onLoadJob, onClose }) {
  const [jobs, setJobs] = useState([]);
  const load = () => api.listJobs().then(setJobs);
  useEffect(() => { load(); }, []);
  const open = async (id) => { const job = await api.getJob(id); onLoadJob(job); onClose(); };
  const del = async (id) => { await api.deleteJob(id); load(); };

  if (!jobs.length) return <Banner tone="info">No saved jobs yet. Complete a take-off and use "Save job" on the Export step.</Banner>;
  return (
    <table className="w-full text-sm">
      <thead><tr><th className="th">Name</th><th className="th">Builder</th><th className="th">Updated</th><th className="th" /></tr></thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.id}>
            <td className="td font-medium">{j.name}</td>
            <td className="td">{j.builder}</td>
            <td className="td text-gray-400">{j.updated_at}</td>
            <td className="td text-right">
              <button className="btn-ghost mr-2" onClick={() => open(j.id)}>Open</button>
              <button className="text-gray-300 hover:text-red-500" onClick={() => del(j.id)}>✕</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TemplatesTab({ onLoadTemplate, onClose }) {
  const [templates, setTemplates] = useState([]);
  const load = () => api.listTemplates().then(setTemplates);
  useEffect(() => { load(); }, []);
  const open = async (id) => { const t = await api.getTemplate(id); onLoadTemplate(t); onClose(); };
  const del = async (id) => { await api.deleteTemplate(id); load(); };

  if (!templates.length) {
    return (
      <Banner tone="info">
        No house-type templates yet. On the Review step of a completed take-off, use "Save as template" to reuse
        this house type's measurements on a future lot without re-running extraction.
      </Banner>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead><tr><th className="th">Name</th><th className="th">Builder</th><th className="th">Created</th><th className="th" /></tr></thead>
      <tbody>
        {templates.map((t) => (
          <tr key={t.id}>
            <td className="td font-medium">{t.name}</td>
            <td className="td">{t.builder}</td>
            <td className="td text-gray-400">{t.created_at}</td>
            <td className="td text-right">
              <button className="btn-ghost mr-2" onClick={() => open(t.id)}>Use</button>
              <button className="text-gray-300 hover:text-red-500" onClick={() => del(t.id)}>✕</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Mini({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}
