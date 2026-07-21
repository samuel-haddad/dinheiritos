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
  const base = 'rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors';
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full p-[3px]" style={{ background: 'var(--surface-2)' }}>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={base}
        style={{
          background: on ? 'var(--surface)' : 'transparent',
          color: on ? 'var(--accent-strong)' : 'var(--muted)',
        }}
      >
        {onLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={base}
        style={{
          background: !on ? 'var(--surface)' : 'transparent',
          color: !on ? 'var(--accent-strong)' : 'var(--muted)',
        }}
      >
        {offLabel}
      </button>
    </div>
  );
}
