// Thin fetch wrapper for the local backend API.
const BASE = '/api';

async function json(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { data, status: res.status });
  return data;
}

export const api = {
  health: () => json('GET', '/health'),

  // settings
  getSettings: () => json('GET', '/settings'),
  saveSettings: (patch) => json('POST', '/settings', patch),
  clearKey: () => json('POST', '/settings/clear-key'),

  // products
  listProducts: (all = false) => json('GET', `/products${all ? '?all=1' : ''}`),
  createProduct: (p) => json('POST', '/products', p),
  updateProduct: (id, p) => json('PUT', `/products/${id}`, p),
  deleteProduct: (id, hard = false) => json('DELETE', `/products/${id}${hard ? '?hard=1' : ''}`),

  // builders
  listBuilders: () => json('GET', '/builders'),
  matchBuilder: (name) => json('GET', `/builders/match?name=${encodeURIComponent(name || '')}`),
  createBuilder: (b) => json('POST', '/builders', b),
  updateBuilder: (id, b) => json('PUT', `/builders/${id}`, b),
  deleteBuilder: (id) => json('DELETE', `/builders/${id}`),
  setBuilderRate: (id, productId, rate) => json('PUT', `/builders/${id}/rates/${productId}`, rate),
  clearBuilderRate: (id, productId) => json('DELETE', `/builders/${id}/rates/${productId}`),

  // Quick pre-check: does the plans address match the energy report address?
  checkAddresses: async (plansFile, energyFile) => {
    const fd = new FormData();
    fd.append('plans', plansFile);
    fd.append('energyReport', energyFile);
    const res = await fetch(BASE + '/extract/check-address', { method: 'POST', body: fd });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { data, status: res.status });
    return data;
  },

  // pipeline — streams NDJSON progress events; onEvent(evt) is called per event.
  extract: async (plansFile, energyFile, onEvent) => {
    const fd = new FormData();
    fd.append('plans', plansFile);
    if (energyFile) fd.append('energyReport', energyFile);
    const res = await fetch(BASE + '/extract', { method: 'POST', body: fd });

    // Non-2xx => a normal JSON error (e.g. missing API key), not a stream.
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw Object.assign(new Error(data?.error || res.statusText), { data, status: res.status });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let result = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        if (evt.type === 'error') throw Object.assign(new Error(evt.error), { data: evt });
        if (evt.type === 'done') result = evt.result;
        onEvent?.(evt);
      }
    }
    if (!result) throw new Error('Extraction ended without a result.');
    return result;
  },
  takeoff: (takeoff, pricing) => json('POST', '/takeoff', { takeoff, pricing }),

  exportXlsx: async (takeoff, pricing) => {
    const res = await fetch(BASE + '/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ takeoff, pricing }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error || 'Export failed');
    }
    const blob = await res.blob();
    const filename =
      res.headers.get('X-Filename') || 'Insulation Take-Off.xlsx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return filename;
  },

  // jobs
  listJobs: () => json('GET', '/jobs'),
  getJob: (id) => json('GET', `/jobs/${id}`),
  saveJob: (job) => json('POST', '/jobs', job),
  deleteJob: (id) => json('DELETE', `/jobs/${id}`),
};
