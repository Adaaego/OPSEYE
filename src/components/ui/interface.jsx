import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

export function Card({ children, className = '', accent = null }) {
  const borderClass = accent === 'red' ? 'border-l-4 border-l-red-400' : accent === 'amber' ? 'border-l-4 border-l-amber-400' : '';
  return (
    <div className={`bg-white border border-slate-200 rounded-lg ${borderClass} ${className}`}>
      {children}
    </div>
  );
}

export function KpiCard({ label, value, caption, trend, trendDirection, trendColor }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-[32px] leading-tight font-medium text-navy-950 mt-2 tabular-nums tracking-tight">
        {value}
      </p>
      {caption && (
        <div className="flex items-center gap-1.5 mt-2">
          {trend && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${trendColor || 'text-slate-500'}`}>
              {trendDirection === 'up' && <ArrowUp className="h-3 w-3" />}
              {trendDirection === 'down' && <ArrowDown className="h-3 w-3" />}
              {trendDirection === 'flat' && <Minus className="h-3 w-3" />}
              {trend}
            </span>
          )}
          <span className="text-[13px] text-slate-500">{caption}</span>
        </div>
      )}
    </Card>
  );
}

export function StatusBadge({ status }) {
  const styles = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  const labels = {
    submitted: 'Submitted',
    pending: 'Pending',
    missing: 'Missing',
    partial: 'Partial',
    fullySubmitted: 'Fully Submitted',
  };
  const colorMap = {
    submitted: 'green',
    pending: 'amber',
    missing: 'red',
    partial: 'amber',
    fullySubmitted: 'green',
  };
  const color = colorMap[status] || 'amber';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[color]}`}>
      {labels[status] || status}
    </span>
  );
}

export function PageHeader({ title, timestamp, action }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-[28px] font-semibold text-navy-950 tracking-tight leading-tight">{title}</h1>
        {timestamp && <p className="text-[13px] text-slate-500 mt-1">{timestamp}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function SectionHeader({ children }) {
  return <h2 className="text-xl font-semibold text-navy-950 mb-4">{children}</h2>;
}

export function Table({ headers, rows, renderRow, accentKey }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200">
            {headers.map((h) => (
              <th key={h} className="text-left text-xs font-medium text-slate-500 px-4 py-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isAccent =
              accentKey && (row[accentKey] === 'pending' || row[accentKey] === 'missing' || row[accentKey] === 'partial');
            return (
              <tr
                key={i}
                className={`border-b border-slate-100 text-[13px] text-navy-900 ${
                  isAccent ? 'bg-amber-50/40' : ''
                }`}
              >
                {renderRow(row, i)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyCell({ value }) {
  return <span className="text-slate-300">{value || '—'}</span>;
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-navy-900 hover:bg-navy-800 text-white',
    secondary: 'bg-white border border-slate-300 hover:bg-slate-50 text-navy-900',
  };
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Select({ value, onChange, options, placeholder, allLabel = 'All', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg bg-white border border-slate-300 pl-3 pr-9 py-2 text-sm text-navy-900 focus:outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400/30 cursor-pointer"
      >
        <option value="">{placeholder || allLabel}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || 'Search…'}
      className="rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-navy-900 placeholder:text-slate-400 focus:outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400/30 w-full sm:w-64"
    />
  );
}
