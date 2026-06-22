import { useMemo } from 'react';
import { Card, FlagBadge } from './ui.jsx';

export function ReviewIssue({ issue, onOpenPage, onResolve, onIgnore }) {
  const tone = issue.severity === 'error' ? 'error' : 'warn';
  const href = issue.target?.section ? `#${issue.target.section}` : undefined;
  return (
    <div className={`rounded-xl border p-3 ${tone === 'error' ? 'border-red-100 bg-red-50/60' : 'border-amber-100 bg-amber-50/60'}`}>
      <FlagBadge severity={issue.severity}>{issue.message}</FlagBadge>
      <div className="mt-2 space-y-1 text-xs text-gray-700">
        {issue.requiredInfo && (
          <p>
            <span className="font-semibold text-gray-900">Required info:</span> {issue.requiredInfo}
          </p>
        )}
        <p>
          <span className="font-semibold text-gray-900">How to clear it:</span> {issue.fixHint}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {href && (
          <a className="text-xs font-medium text-accent hover:text-accent-dark" href={href}>
            Edit linked field
          </a>
        )}
        {issue.target?.page && (
          <button className="text-xs font-medium text-accent hover:text-accent-dark" onClick={() => onOpenPage({ page: issue.target.page })}>
            Open page {issue.target.page}
          </button>
        )}
        <button className="text-xs font-medium text-green-700 hover:text-green-800" onClick={onResolve}>
          Mark resolved
        </button>
        <button className="text-xs font-medium text-gray-500 hover:text-gray-700" onClick={onIgnore}>
          Ignore / skip
        </button>
      </div>
    </div>
  );
}

export function SourceCell({ row, onOpen }) {
  const ref = row.source_ref || (row.source_page || row.source_sheet || row.source_snippet
    ? { page: row.source_page, sheet: row.source_sheet, table: row.source_table, snippet: row.source_snippet }
    : null);
  if (!ref) return <span className="text-xs text-gray-300">No ref</span>;
  return (
    <button
      type="button"
      className="max-w-[150px] text-left text-xs text-accent hover:text-accent-dark"
      onClick={() => onOpen(ref)}
      title={[ref.sheet, ref.table, ref.snippet].filter(Boolean).join(' · ')}
    >
      {ref.page ? `Page ${ref.page}` : ref.sheet || 'Source'}
      {ref.sheet && <span className="block truncate text-gray-400">{ref.sheet}</span>}
    </button>
  );
}

export function PlanPreview({ fileUrl, source }) {
  const src = useMemo(() => {
    if (!fileUrl) return null;
    return source?.page ? `${fileUrl}#page=${source.page}` : fileUrl;
  }, [fileUrl, source]);

  return (
    <aside className="hidden xl:block">
      <div className="sticky top-24 space-y-3">
        <Card title="Plan source" subtitle={source ? [source.sheet, source.table, source.snippet].filter(Boolean).join(' · ') || 'Selected source' : 'Select a source link from a row.'}>
          {src ? (
            <iframe title="Plan preview" src={src} className="h-[620px] w-full rounded-lg border border-gray-200 bg-gray-50" />
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-400">
              The uploaded plans PDF will appear here after extraction.
            </div>
          )}
        </Card>
      </div>
    </aside>
  );
}
