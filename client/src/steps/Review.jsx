import { useEffect, useState } from 'react';
import { Card, Banner, FlagBadge } from '../components/ui.jsx';
import { EditableTable } from '../components/EditableTable.jsx';
import { PlanPreview, ReviewIssue, SourceCell } from '../components/PlanReview.jsx';

const MATERIALS = ['lightweight', 'brick', 'hebel'];
const LEVELS = ['ground', 'first'];
const WRAP_LEVELS = ['ground', 'first', 'subfloor', 'gable'];
const SOURCES = ['labelled', 'scaled', 'schedule', 'code', 'area_schedule', 'floor_plan'];
const CONF = ['high', 'medium', 'low'];
const REQ_ELEMENTS = ['external_wall', 'special_wall', 'garage_wall', 'ceiling', 'ceiling_outdoor', 'roof', 'wall_wrap', 'subfloor_wrap', 'continuous_sealing'];

const n2 = (v) => (v == null || isNaN(v) ? '' : Number(v).toFixed(2));

function useObjectUrl(file) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export default function Review({ takeoff, setTakeoff, computed, builderMatch, plansFile, onBack, onNext }) {
  const t = takeoff;
  const [selectedSource, setSelectedSource] = useState(null);
  const plansUrl = useObjectUrl(plansFile);

  const setSection = (key, value) => setTakeoff({ ...t, [key]: value });
  const setProject = (field, value) => setTakeoff({ ...t, project: { ...t.project, [field]: value } });
  const setEnergy = (field, value) => setTakeoff({ ...t, energy_report: { ...t.energy_report, [field]: value } });
  const setResolution = (key, value) =>
    setTakeoff({ ...t, user_resolutions: { ...(t.user_resolutions || {}), [key]: value } });
  const setIssueAction = (id, status) =>
    setTakeoff({ ...t, issue_actions: { ...(t.issue_actions || {}), [id]: { status, at: new Date().toISOString() } } });
  const reopenIssue = (id) => {
    const next = { ...(t.issue_actions || {}) };
    delete next[id];
    setTakeoff({ ...t, issue_actions: next });
  };

  const s = computed?.measurements?.summary;
  const flags = t.flags || [];
  const issues = computed?.validation?.issues || [];
  const activeIssues = issues.filter((issue) => !t.issue_actions?.[issue.id]);
  const closedIssues = issues.filter((issue) => t.issue_actions?.[issue.id]);
  const sourceCol = (label = 'Source ref') => ({
    key: 'source_ref',
    label,
    width: 150,
    render: (row) => <SourceCell row={row} onOpen={setSelectedSource} />,
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        {(flags.length > 0 || activeIssues.length > 0 || closedIssues.length > 0) && (
          <Card title="Needs review" subtitle="Each item says what information is needed. Fix it, mark it resolved, or ignore it for this job.">
            <div className="space-y-3">
              {activeIssues.map((issue) => (
                <ReviewIssue
                  key={issue.id}
                  issue={issue}
                  onOpenPage={setSelectedSource}
                  onResolve={() => setIssueAction(issue.id, 'resolved')}
                  onIgnore={() => setIssueAction(issue.id, 'ignored')}
                />
              ))}
              {closedIssues.length > 0 && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase text-gray-500">Closed review items</p>
                  <div className="mt-2 space-y-1">
                    {closedIssues.map((issue) => (
                      <div key={issue.id} className="flex items-center justify-between gap-3 text-xs text-gray-600">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{t.issue_actions?.[issue.id]?.status === 'ignored' ? 'Ignored' : 'Resolved'}:</span> {issue.message}
                        </span>
                        <button className="shrink-0 font-medium text-accent hover:text-accent-dark" onClick={() => reopenIssue(issue.id)}>
                          Reopen
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {flags.map((f, i) => (
                <div key={i} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                  <FlagBadge severity={f.severity}>
                    {f.message}
                    {f.location ? ` · ${f.location}` : ''}
                  </FlagBadge>
                  <textarea
                    className="input mt-2 min-h-[70px] resize-y bg-white"
                    value={t.user_resolutions?.[`flag_${i}`] || ''}
                    onChange={(e) => setResolution(`flag_${i}`, e.target.value)}
                    placeholder="User supplied detail / decision"
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card title="Live totals" subtitle="Recomputes as you edit">
          {!s ? (
            <p className="text-sm text-gray-400">Computing...</p>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
              <Total label="Brick + Hebel walls" value={s.brick_hebel_m2} />
              <Total label="Lightweight walls" value={s.lightweight_m2} />
              <Total label="Gables" value={s.gables_m2} />
              <Total label="Garage internal" value={s.garage_internal_m2} />
              <Total label="Ceiling insulated" value={s.ceiling_insulated_m2} />
              <Total label="Ceiling gross" value={s.ceiling_gross_m2} muted />
              <Total label="Wrap — lower" value={s.wrap_ground_m2} />
              <Total label="Wrap — upper" value={s.wrap_first_m2} />
              <Total label="Wrap — subfloor" value={s.wrap_subfloor_m2} />
              <Total label="Wrap — gable" value={s.wrap_gable_m2} muted />
              <Total label="Continuous items" value={s.continuous_total_lm} unit="lm" />
            </dl>
          )}
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <button className="btn-ghost" onClick={onBack}>← Back</button>
            <button className="btn-primary" onClick={onNext}>Rates &amp; Quote →</button>
          </div>
        </Card>

        <Card title="Project & builder">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Address" value={t.project?.address} onChange={(v) => setProject('address', v)} />
            <Field label="Builder" value={t.project?.builder} onChange={(v) => setProject('builder', v)} />
            <Field label="Lot" value={t.project?.lot} onChange={(v) => setProject('lot', v)} />
            <Field label="Plan number" value={t.project?.plan_number} onChange={(v) => setProject('plan_number', v)} />
            <Field label="Designer" value={t.project?.designer} onChange={(v) => setProject('designer', v)} />
            <Field label="Client" value={t.project?.client} onChange={(v) => setProject('client', v)} />
            <Field label="Drawing revision" value={t.project?.drawing_revision} onChange={(v) => setProject('drawing_revision', v)} />
            <Field label="Drawing number" value={t.project?.drawing_number} onChange={(v) => setProject('drawing_number', v)} />
          </div>
          {t.project?.address_source === 'missing' && (
            <div className="mt-3">
              <Banner tone="warn" title="No address on plans">
                The export will be named from the drawing/job number. Add an address above to override.
              </Banner>
            </div>
          )}
          {builderMatch?.matched && (
            <p className="mt-3 text-sm text-green-700">
              ✓ Matched builder profile: <strong>{builderMatch.builderName}</strong> ({Math.round(builderMatch.score * 100)}% · {builderMatch.reason})
            </p>
          )}
        </Card>

        <Card
          id="energy_requirements"
          title="Energy requirements"
          subtitle={t.energy_report?.present ? `${t.energy_report?.standard || ''} · ${t.energy_report?.star_rating || ''}★ · CZ ${t.energy_report?.climate_zone || ''}` : 'No energy report — add R-values here to enable auto-pricing, or leave blank for measurements only.'}
        >
          {!t.energy_report?.present && (
            <div className="mb-3">
              <Banner tone="info" title="Measurements-only mode">
                No energy report was supplied. You can still type R-values per element below (or per line in Rates &amp; Quote).
              </Banner>
            </div>
          )}
          <EditableTable
            columns={[
              { key: 'element', label: 'Element', type: 'select', options: REQ_ELEMENTS },
              { key: 'location', label: 'Location / zone', type: 'text' },
              { key: 'r_value', label: 'R-value', type: 'text', width: 90 },
              { key: 'build_up', label: 'Build-up', type: 'text' },
              sourceCol('EE source'),
            ]}
            rows={t.energy_report?.requirements || []}
            onChange={(rows) => setEnergy('requirements', rows)}
            onAdd={() => setEnergy('requirements', [...(t.energy_report?.requirements || []), { element: 'external_wall', location: '', r_value: '', build_up: '' }])}
            onRemove={(i) => setEnergy('requirements', (t.energy_report?.requirements || []).filter((_, idx) => idx !== i))}
            addLabel="Add requirement"
            empty="No requirements"
          />
        </Card>

        <Card id="walls_external" title="External walls" subtitle="One row per wall segment. Gross = length × height. Doors are deducted at material × level group level.">
          <EditableTable
            columns={[
              { key: 'level', label: 'Level', type: 'select', options: LEVELS, width: 90 },
              { key: 'location', label: 'Location', type: 'text' },
              { key: 'material', label: 'Material', type: 'select', options: MATERIALS, width: 120 },
              { key: 'orientation', label: 'Orient.', type: 'text', width: 70 },
              { key: 'length_m', label: 'Length m', type: 'number', width: 90 },
              { key: 'height_m', label: 'Height m', type: 'number', width: 90 },
              { key: 'gross', label: 'Gross m²', compute: (r) => n2((Number(r.length_m) || 0) * (Number(r.height_m) || 0)) },
              { key: 'source', label: 'Source', type: 'select', options: SOURCES, allowEmpty: true, width: 110 },
              sourceCol(),
              { key: 'confidence', label: 'Conf.', type: 'select', options: CONF, allowEmpty: true, width: 90 },
              { key: 'notes', label: 'Notes / user input', type: 'text' },
            ]}
            rows={t.walls_external || []}
            onChange={(rows) => setSection('walls_external', rows)}
            onAdd={() => setSection('walls_external', [...(t.walls_external || []), { level: 'ground', location: '', material: 'lightweight', length_m: null, height_m: null, orientation: '', source: 'labelled', confidence: 'high', notes: '' }])}
            onRemove={(i) => setSection('walls_external', t.walls_external.filter((_, idx) => idx !== i))}
            rowFlagged={(r) => ['low', 'medium'].includes((r.confidence || '').toLowerCase()) || (r.source || '') === 'scaled'}
            addLabel="Add wall segment"
            empty="No wall segments"
          />
        </Card>

        <Card id="doors" title="Doors (deducted)" subtitle="Only doors are deducted — windows are not. Codes are HHWW in decimetres.">
          <EditableTable
            columns={[
              { key: 'location', label: 'Location', type: 'text' },
              { key: 'code', label: 'Code', type: 'text', width: 80 },
              { key: 'height_m', label: 'Height m', type: 'number', width: 90 },
              { key: 'width_m', label: 'Width m', type: 'number', width: 90 },
              { key: 'in_material', label: 'In material', type: 'select', options: MATERIALS, width: 120 },
              { key: 'level', label: 'Level', type: 'select', options: LEVELS, width: 90 },
              { key: 'source', label: 'Source', type: 'select', options: ['schedule', 'code', 'scaled'], allowEmpty: true, width: 100 },
              sourceCol(),
            ]}
            rows={t.openings?.doors || []}
            onChange={(rows) => setSection('openings', { ...t.openings, doors: rows })}
            onAdd={() => setSection('openings', { ...t.openings, doors: [...(t.openings?.doors || []), { location: '', code: '', height_m: null, width_m: null, in_material: 'lightweight', level: 'ground', source: 'schedule' }] })}
            onRemove={(i) => setSection('openings', { ...t.openings, doors: t.openings.doors.filter((_, idx) => idx !== i) })}
            addLabel="Add door"
            empty="No doors"
          />
        </Card>

        <Card id="gables" title="Gables" subtitle="Height computed from pitch when not printed. Area = 1/2 × base × height.">
          <EditableTable
            columns={[
              { key: 'level', label: 'Level', type: 'select', options: LEVELS, width: 90 },
              { key: 'location', label: 'Location', type: 'text' },
              { key: 'base_width_m', label: 'Base m', type: 'number', width: 90 },
              { key: 'pitch_deg', label: 'Pitch deg', type: 'number', width: 80 },
              { key: 'gable_height_m', label: 'Height m', type: 'number', width: 90 },
              { key: 'area', label: 'Area m²', compute: (r) => { const h = r.gable_height_m != null ? Number(r.gable_height_m) : (Number(r.base_width_m) || 0) / 2 * Math.tan((Number(r.pitch_deg) || 0) * Math.PI / 180); return n2(0.5 * (Number(r.base_width_m) || 0) * h); } },
              { key: 'material', label: 'Material', type: 'select', options: MATERIALS, width: 120 },
              { key: 'source', label: 'Source', type: 'select', options: SOURCES, allowEmpty: true, width: 110 },
              sourceCol(),
              { key: 'confidence', label: 'Conf.', type: 'select', options: CONF, allowEmpty: true, width: 90 },
              { key: 'notes', label: 'Notes / user input', type: 'text' },
            ]}
            rows={t.gables || []}
            onChange={(rows) => setSection('gables', rows)}
            onAdd={() => setSection('gables', [...(t.gables || []), { level: 'first', location: '', base_width_m: null, pitch_deg: null, gable_height_m: null, material: 'lightweight', source: 'scaled', confidence: 'medium' }])}
            onRemove={(i) => setSection('gables', t.gables.filter((_, idx) => idx !== i))}
            rowFlagged={(r) => r.gable_height_m == null}
            addLabel="Add gable"
            empty="No gables"
          />
        </Card>

        <Card id="garage_internal_walls" title="Garage internal walls">
          <EditableTable
            columns={[
              { key: 'location', label: 'Location', type: 'text' },
              { key: 'length_m', label: 'Length m', type: 'number', width: 90 },
              { key: 'height_m', label: 'Height m', type: 'number', width: 90 },
              { key: 'gross', label: 'Gross m²', compute: (r) => n2((Number(r.length_m) || 0) * (Number(r.height_m) || 0)) },
              { key: 'source', label: 'Source', type: 'select', options: SOURCES, allowEmpty: true, width: 110 },
              sourceCol(),
              { key: 'confidence', label: 'Conf.', type: 'select', options: CONF, allowEmpty: true, width: 90 },
              { key: 'notes', label: 'Notes / user input', type: 'text' },
            ]}
            rows={t.garage_internal_walls || []}
            onChange={(rows) => setSection('garage_internal_walls', rows)}
            onAdd={() => setSection('garage_internal_walls', [...(t.garage_internal_walls || []), { location: '', length_m: null, height_m: null, openings: [], source: 'labelled', confidence: 'high' }])}
            onRemove={(i) => setSection('garage_internal_walls', t.garage_internal_walls.filter((_, idx) => idx !== i))}
            rowFlagged={(r) => ['low', 'medium'].includes((r.confidence || '').toLowerCase()) || (r.source || '') === 'scaled'}
            addLabel="Add garage wall"
            empty="No garage internal walls"
          />
        </Card>

        <Card id="ceilings" title="Ceilings" subtitle="Only ceilings marked Insulated are quoted. Inter-floor ceilings are usually not insulated.">
          <EditableTable
            columns={[
              { key: 'area_type', label: 'Area type', type: 'text', width: 120 },
              { key: 'level', label: 'Level', type: 'select', options: LEVELS, allowEmpty: true, width: 90 },
              { key: 'length_m', label: 'L m', type: 'number', width: 70 },
              { key: 'width_m', label: 'W m', type: 'number', width: 70 },
              { key: 'area_m2', label: 'Area m²', type: 'number', width: 90 },
              { key: 'r_value', label: 'R-value', type: 'text', width: 80 },
              { key: 'insulated', label: 'Insul.?', type: 'bool', width: 60 },
              { key: 'source', label: 'Source', type: 'select', options: SOURCES, allowEmpty: true, width: 110 },
              sourceCol(),
              { key: 'confidence', label: 'Conf.', type: 'select', options: CONF, allowEmpty: true, width: 90 },
              { key: 'notes', label: 'Notes / user input', type: 'text' },
            ]}
            rows={t.ceilings || []}
            onChange={(rows) => setSection('ceilings', rows)}
            onAdd={() => setSection('ceilings', [...(t.ceilings || []), { area_type: '', level: null, length_m: null, width_m: null, area_m2: null, r_value: '', insulated: false, source: 'area_schedule', confidence: 'high' }])}
            onRemove={(i) => setSection('ceilings', t.ceilings.filter((_, idx) => idx !== i))}
            rowFlagged={(r) => ['low', 'medium'].includes((r.confidence || '').toLowerCase()) || (r.source || '') === 'scaled'}
            addLabel="Add ceiling area"
            empty="No ceilings"
          />
        </Card>

        <Card id="wall_wrap" title="Wall wrap" subtitle="Sarking/vapour wrap by level — lower (ground), upper (first), subfloor, or gable. Area = length × height when no direct figure is given.">
          <EditableTable
            columns={[
              { key: 'level', label: 'Level', type: 'select', options: WRAP_LEVELS, width: 100 },
              { key: 'location', label: 'Location', type: 'text' },
              { key: 'wrap_type', label: 'Wrap type', type: 'text', width: 160 },
              { key: 'length_m', label: 'Length m', type: 'number', width: 90 },
              { key: 'height_m', label: 'Height m', type: 'number', width: 90 },
              { key: 'area_m2', label: 'Area m²', type: 'number', width: 90 },
              { key: 'source', label: 'Source', type: 'select', options: SOURCES, allowEmpty: true, width: 110 },
              sourceCol(),
              { key: 'confidence', label: 'Conf.', type: 'select', options: CONF, allowEmpty: true, width: 90 },
              { key: 'notes', label: 'Notes / user input', type: 'text' },
            ]}
            rows={t.wall_wrap || []}
            onChange={(rows) => setSection('wall_wrap', rows)}
            onAdd={() => setSection('wall_wrap', [...(t.wall_wrap || []), { level: 'ground', location: '', wrap_type: '', length_m: null, height_m: null, area_m2: null, source: 'schedule', confidence: 'high' }])}
            onRemove={(i) => setSection('wall_wrap', t.wall_wrap.filter((_, idx) => idx !== i))}
            rowFlagged={(r) => !r.wrap_type || (r.area_m2 == null && (r.length_m == null || r.height_m == null))}
            addLabel="Add wrap row"
            empty="No wall wrap"
          />
        </Card>

        <Card id="continuous_items" title="Continuous / linear items" subtitle="Draught sealing, expanding foam, or acoustic sealant measured in lineal metres rather than area.">
          <EditableTable
            columns={[
              { key: 'location', label: 'Location', type: 'text' },
              { key: 'level', label: 'Level', type: 'text', width: 100 },
              { key: 'item_type', label: 'Item type', type: 'text', width: 180 },
              { key: 'length_m', label: 'Length (lm)', type: 'number', width: 100 },
              { key: 'source', label: 'Source', type: 'select', options: SOURCES, allowEmpty: true, width: 110 },
              sourceCol(),
              { key: 'confidence', label: 'Conf.', type: 'select', options: CONF, allowEmpty: true, width: 90 },
              { key: 'notes', label: 'Notes / user input', type: 'text' },
            ]}
            rows={t.continuous_items || []}
            onChange={(rows) => setSection('continuous_items', rows)}
            onAdd={() => setSection('continuous_items', [...(t.continuous_items || []), { location: '', level: '', item_type: '', length_m: null, source: 'schedule', confidence: 'high' }])}
            onRemove={(i) => setSection('continuous_items', t.continuous_items.filter((_, idx) => idx !== i))}
            rowFlagged={(r) => !r.length_m}
            addLabel="Add continuous item"
            empty="No continuous / linear items"
          />
        </Card>
      </div>

      <PlanPreview fileUrl={plansUrl} source={selectedSource} />
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Total({ label, value, muted, unit = 'm²' }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-100">
      <dt className={`text-xs ${muted ? 'text-gray-400' : 'text-gray-500'}`}>{label}</dt>
      <dd className={`mt-1 tabular-nums font-semibold ${muted ? 'text-gray-400' : 'text-gray-900'}`}>{n2(value)} {unit}</dd>
    </div>
  );
}
