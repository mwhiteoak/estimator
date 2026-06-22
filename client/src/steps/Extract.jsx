import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, Banner } from '../components/ui.jsx';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const PLANS_HINTS = [
  'Identifying external wall segments…',
  'Reading elevations for façade materials…',
  'Picking up door schedules & opening sizes…',
  'Checking gable pitches and ceiling areas…',
  'Cross-referencing the area schedule…',
];

export default function Extract({ files, onResult, onBack, onOpenSettings }) {
  const hasEnergy = Boolean(files.energyFile);
  const [status, setStatus] = useState('running'); // running | error | badjson
  const [error, setError] = useState(null);
  const [raw, setRaw] = useState(null);

  const [activeStage, setActiveStage] = useState('project');
  const [done, setDone] = useState({});
  const [chars, setChars] = useState({ project: 0, energy: 0, plans: 0 });
  const [models, setModels] = useState({});
  const [previews, setPreviews] = useState({ project: null, energy: null, plans: null });
  const [notes, setNotes] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);
  const startedRef = useRef(false);

  // Elapsed timer.
  useEffect(() => {
    if (status !== 'running') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  // Rotating hint while the plans pass runs.
  useEffect(() => {
    if (status !== 'running' || activeStage !== 'plans') return;
    const t = setInterval(() => setHintIdx((i) => (i + 1) % PLANS_HINTS.length), 3500);
    return () => clearInterval(t);
  }, [status, activeStage]);

  const run = async () => {
    setStatus('running');
    setError(null);
    setRaw(null);
    setDone({});
    setChars({ project: 0, energy: 0, plans: 0 });
    setPreviews({ project: null, energy: null, plans: null });
    setNotes([]);
    setElapsed(0);
    setActiveStage('project');
    try {
      const result = await api.extract(files.plansFile, files.energyFile, (evt) => {
        if (evt.type === 'stage') {
          setActiveStage(evt.stage);
          if (evt.stage === 'energy') setDone((d) => ({ ...d, project: true }));
          if (evt.stage === 'plans') setDone((d) => ({ ...d, project: true, energy: hasEnergy ? true : d.energy }));
          if (evt.model) setModels((m) => ({ ...m, [evt.stage]: evt.model }));
        } else if (evt.type === 'progress') {
          setChars((c) => ({ ...c, [evt.stage]: evt.chars }));
        } else if (evt.type === 'preview') {
          if (evt.stage === 'project') setPreviews((p) => ({ ...p, project: evt.project }));
          if (evt.stage === 'energy') setPreviews((p) => ({ ...p, energy: evt.energyReport }));
          if (evt.stage === 'plans') setPreviews((p) => ({ ...p, plans: evt.plansSummary }));
        } else if (evt.type === 'note') {
          setNotes((n) => [...n, evt]);
        }
      });
      onResult(result);
    } catch (e) {
      if (e.data?.code === 'BAD_JSON') {
        setStatus('badjson');
        setRaw(e.data.raw);
      } else {
        setStatus('error');
        const keyIssue = e.data?.code === 'NO_API_KEY' || e.data?.code === 'BAD_KEY';
        setError({ message: e.data?.error || e.message, keyIssue });
      }
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stages = hasEnergy ? ['project', 'energy', 'plans'] : ['project', 'plans'];

  return (
    <Card
      title="Reading the documents"
      subtitle="Claude extracts raw structured data — dimensions, materials, R-values, flags. No arithmetic happens here."
    >
      {status === 'running' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Working — this can take a minute or two for large plan sets.</p>
            <span className="rounded-full bg-gray-100 px-3 py-1 font-mono text-sm tabular-nums text-gray-600">⏱ {fmtTime(elapsed)}</span>
          </div>

          {(previews.project || previews.energy || previews.plans) && (
            <div className="grid gap-3 lg:grid-cols-3">
              {previews.project && <ProjectPreview project={previews.project} />}
              {previews.energy && <EnergyPreview report={previews.energy} />}
              {previews.plans && <PlansPreview summary={previews.plans} />}
            </div>
          )}

          <div className="space-y-3">
            {stages.map((stage) => {
              const isActive = activeStage === stage && !done[stage];
              const isDone = done[stage];
              const meta = stage === 'energy'
                ? { title: 'Distilling the energy report', hint: 'Pulling only the insulation requirements out of a long report.' }
                : stage === 'project'
                ? { title: 'Finding the project details', hint: 'Reading the title block for builder, address and drawing details.' }
                : { title: 'Reading the plans & measuring up', hint: PLANS_HINTS[hintIdx] };
              return (
                <div
                  key={stage}
                  className={`flex items-start gap-3 rounded-xl border p-4 transition ${
                    isActive ? 'border-accent bg-accent/5' : isDone ? 'border-green-200 bg-green-50/40' : 'border-gray-200 bg-gray-50/40'
                  }`}
                >
                  <div className="mt-0.5">
                    {isDone ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-sm text-white">✓</span>
                    ) : isActive ? (
                      <span className="block h-6 w-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-200 text-xs text-gray-400">…</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-semibold ${isActive ? 'text-accent' : isDone ? 'text-green-700' : 'text-gray-400'}`}>
                        {meta.title}
                      </p>
                      {models[stage] && (
                        <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-400 ring-1 ring-gray-200">
                          {models[stage]}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <>
                        <p className="mt-0.5 text-xs text-gray-500">{meta.hint}</p>
                        {chars[stage] > 0 && (
                          <p className="mt-1 font-mono text-xs tabular-nums text-gray-400">
                            {chars[stage].toLocaleString()} characters received…
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {notes.length > 0 && (
            <div className="space-y-1">
              {notes.map((n, i) => (
                <p key={i} className={`text-xs ${n.level === 'warn' ? 'text-amber-700' : 'text-green-700'}`}>
                  {n.level === 'warn' ? '⚠' : '✓'} {n.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4">
          <Banner tone="error" title={error?.keyIssue ? 'API key problem' : 'Extraction failed'}>
            {error?.message}
          </Banner>
          <div className="flex gap-2">
            {error?.keyIssue && (
              <button className="btn-primary" onClick={onOpenSettings}>
                Open Settings to add a key
              </button>
            )}
            <button className="btn-ghost" onClick={run}>Retry</button>
            <button className="btn-ghost" onClick={onBack}>← Back to upload</button>
          </div>
        </div>
      )}

      {status === 'badjson' && (
        <div className="space-y-4">
          <Banner tone="warn" title="Claude did not return valid JSON">
            The raw model output is shown below so nothing is lost. Retry, or switch to a stronger model in Settings.
          </Banner>
          <pre className="max-h-80 overflow-auto rounded-xl bg-gray-900 p-4 text-xs text-gray-100">{raw}</pre>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={run}>Retry</button>
            <button className="btn-ghost" onClick={onBack}>← Back</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ProjectPreview({ project }) {
  const rows = [
    ['Address', project.address],
    ['Builder', project.builder],
    ['Lot / plan', [project.lot, project.plan_number].filter(Boolean).join(' / ')],
    ['Drawing', project.drawing_revision || project.drawing_number],
  ].filter(([, value]) => value);

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
      <p className="text-sm font-semibold text-blue-900">Project details found</p>
      <dl className="mt-2 grid gap-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[92px_1fr] gap-2">
            <dt className="text-blue-700/70">{label}</dt>
            <dd className="min-w-0 truncate font-medium text-blue-950">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EnergyPreview({ report }) {
  const reqs = report.requirements || [];
  const [expanded, setExpanded] = useState(false);
  const visibleReqs = expanded ? reqs : reqs.slice(0, 5);
  return (
    <div className="rounded-xl border border-green-100 bg-green-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-green-900">Energy requirements found</p>
          <p className="mt-0.5 text-xs text-green-700">
            {[report.standard, report.star_rating ? `${report.star_rating} star` : null, report.climate_zone ? `CZ ${report.climate_zone}` : null]
              .filter(Boolean)
              .join(' · ') || 'Report parsed'}
          </p>
        </div>
        <span className="rounded bg-white px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
          {reqs.length} lines
        </span>
      </div>
      {reqs.length > 0 && (
        <>
          <div className={`mt-2 space-y-2 pr-1 ${expanded ? 'max-h-72 overflow-y-auto' : ''}`}>
            {visibleReqs.map((r, i) => (
              <div key={`${r.element || 'req'}-${i}`} className="rounded-lg bg-white/70 p-2 text-sm ring-1 ring-green-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-green-950">{r.element || 'requirement'}</p>
                    <p className="mt-0.5 text-xs text-green-800">
                      {r.location || 'No location/zone shown'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-800">
                    {r.r_value || 'No R'}
                  </span>
                </div>
                {(r.build_up || r.source_page || r.source_ref?.page) && (
                  <p className="mt-1 text-xs text-green-700">
                    {[r.build_up, r.source_page || r.source_ref?.page ? `page ${r.source_page || r.source_ref?.page}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
          {reqs.length > 5 && (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-green-800 hover:text-green-950"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Collapse requirements' : `Show all ${reqs.length} requirements`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PlansPreview({ summary }) {
  const rows = [
    ['Walls', summary.externalWalls],
    ['Doors', summary.doors],
    ['Gables', summary.gables],
    ['Garage', summary.garageInternal],
    ['Ceilings', summary.ceilings],
    ['Flags', summary.flags],
    ['Assumptions', summary.assumptions],
  ];
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
      <p className="text-sm font-semibold text-amber-900">Plans takeoff compiled</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-amber-700/80">{label}</dt>
            <dd className="font-semibold text-amber-950">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
