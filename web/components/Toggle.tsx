'use client';

// Toggle de dois estados (pílula segmentada). Usado nos filtros de exibição.
export default function Toggle({
  on,
  onChange,
  onLabel,
  offLabel,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  const base = 'rounded-md px-3 py-1 text-sm font-medium transition-colors';
  const active = 'bg-accent-600/10 text-accent-600 dark:bg-accent-500/15 dark:text-accent-400';
  const idle = 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200';
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 p-0.5 dark:border-navy-700">
      <button type="button" onClick={() => onChange(true)} className={`${base} ${on ? active : idle}`}>
        {onLabel}
      </button>
      <button type="button" onClick={() => onChange(false)} className={`${base} ${!on ? active : idle}`}>
        {offLabel}
      </button>
    </div>
  );
}
