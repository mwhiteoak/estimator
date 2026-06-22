// Small reusable UI primitives for the card aesthetic.

export function Card({ title, subtitle, action, children, className = '', id }) {
  return (
    <div id={id} className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

const STEPS = ['Upload', 'Extract', 'Review & Edit', 'Rates & Quote', 'Export'];

export function Stepper({ current, onJump, maxReached }) {
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const reachable = i <= maxReached;
        return (
          <div key={label} className="flex items-center">
            <button
              disabled={!reachable}
              onClick={() => reachable && onJump(i)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? 'bg-accent text-white'
                  : done
                  ? 'bg-accent/10 text-accent hover:bg-accent/20'
                  : reachable
                  ? 'bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50'
                  : 'bg-white text-gray-300 ring-1 ring-gray-100 cursor-not-allowed'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  active ? 'bg-white/20' : done ? 'bg-accent/20' : 'bg-gray-100'
                }`}
              >
                {i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <div className="mx-1 h-px w-3 bg-gray-200 sm:w-6" />}
          </div>
        );
      })}
    </div>
  );
}

export function FlagBadge({ severity = 'info', children }) {
  const map = {
    info: 'bg-blue-50 text-blue-700 ring-blue-200',
    warn: 'bg-amber-50 text-amber-800 ring-amber-200',
    error: 'bg-red-50 text-red-700 ring-red-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${map[severity] || map.info}`}>
      {children}
    </span>
  );
}

export function ConfidenceTag({ value }) {
  const v = (value || '').toLowerCase();
  const map = {
    high: 'bg-green-50 text-green-700',
    medium: 'bg-amber-50 text-amber-700',
    low: 'bg-red-50 text-red-700',
  };
  if (!v) return null;
  return <span className={`rounded px-1.5 py-0.5 text-xs ${map[v] || 'bg-gray-100 text-gray-600'}`}>{v}</span>;
}

export function Banner({ tone = 'info', title, children, action }) {
  const map = {
    info: 'bg-blue-50 ring-blue-200 text-blue-900',
    warn: 'bg-amber-50 ring-amber-200 text-amber-900',
    success: 'bg-green-50 ring-green-200 text-green-900',
    error: 'bg-red-50 ring-red-200 text-red-900',
  };
  return (
    <div className={`flex items-start justify-between gap-4 rounded-xl px-4 py-3 ring-1 ${map[tone]}`}>
      <div>
        {title && <p className="text-sm font-semibold">{title}</p>}
        {children && <div className="mt-0.5 text-sm opacity-90">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-500">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-accent" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
