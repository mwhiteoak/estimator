// Generic inline-editable table bound to an array of row objects.
// columns: [{ key, label, type: 'text'|'number'|'select'|'bool', options?, width?, readOnly?, compute? }]
// compute(row) returns a derived display value (e.g. gross m²) shown read-only.
import { ConfidenceTag } from './ui.jsx';

export function EditableTable({ columns, rows, onChange, onAdd, onRemove, rowFlagged, addLabel = 'Add row', empty = 'No rows' }) {
  const tableMinWidth = columns.reduce((sum, c) => sum + (c.width || (c.type === 'text' ? 190 : 120)), onRemove ? 56 : 0);
  const setCell = (i, key, value) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r));
    onChange(next);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0" style={{ minWidth: Math.max(tableMinWidth, 760) }}>
        <thead>
          <tr className="border-b">
            {columns.map((c) => (
              <th key={c.key} className="th whitespace-nowrap" style={c.width ? { width: c.width } : undefined}>
                {c.label}
              </th>
            ))}
            {onRemove && <th className="th" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="td py-4 text-gray-400" colSpan={columns.length + 1}>
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row, i) => {
            const flagged = rowFlagged ? rowFlagged(row) : false;
            return (
              <tr key={i} className={flagged ? 'bg-amber-50' : i % 2 ? 'bg-gray-50/40' : ''}>
                {columns.map((c) => (
                  <td key={c.key} className="td align-top">
                    {renderCell(c, row, i, setCell)}
                  </td>
                ))}
                {onRemove && (
                  <td className="td text-right align-top">
                    <button
                      onClick={() => onRemove(i)}
                      className="rounded px-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {onAdd && (
        <button onClick={onAdd} className="mt-3 text-sm font-medium text-accent hover:text-accent-dark">
          + {addLabel}
        </button>
      )}
    </div>
  );
}

function renderCell(c, row, i, setCell) {
  const val = row[c.key];

  if (c.render) {
    return c.render(row, i);
  }
  if (c.compute) {
    const v = c.compute(row);
    return <span className="block px-1.5 py-1 font-medium tabular-nums text-gray-900">{v}</span>;
  }
  if (c.key === 'confidence' && c.readOnly) {
    return <ConfidenceTag value={val} />;
  }
  if (c.readOnly) {
    return <span className="block px-1.5 py-1 text-gray-600">{val == null ? '' : String(val)}</span>;
  }
  if (c.type === 'select') {
    return (
      <select className="cell-input" value={val ?? ''} onChange={(e) => setCell(i, c.key, e.target.value)}>
        {c.allowEmpty && <option value="" />}
        {c.options.map((o) => (
          <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
            {typeof o === 'string' ? o : o.label}
          </option>
        ))}
      </select>
    );
  }
  if (c.type === 'bool') {
    return (
      <input
        type="checkbox"
        className="h-4 w-4 accent-blue-600"
        checked={Boolean(val)}
        onChange={(e) => setCell(i, c.key, e.target.checked)}
      />
    );
  }
  if (c.type === 'number') {
    return (
      <input
        type="number"
        step="any"
        className="cell-input tabular-nums"
        value={val ?? ''}
        onChange={(e) => setCell(i, c.key, e.target.value === '' ? null : Number(e.target.value))}
      />
    );
  }
  return (
    <input
      type="text"
      className="cell-input"
      value={val ?? ''}
      onChange={(e) => setCell(i, c.key, e.target.value)}
    />
  );
}
