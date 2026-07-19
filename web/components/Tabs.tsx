'use client';

export default function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2 dark:border-navy-700">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            t === active
              ? 'bg-accent-600/10 text-accent-600 dark:bg-accent-500/15 dark:text-accent-400'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
