export default function HealthChip({ health }: { health: string }) {
  const map: Record<string, [string, string]> = {
    on_track: ['no prazo', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'],
    late: ['vai atrasar', 'bg-amber-500/15 text-amber-600 dark:text-amber-400'],
    infeasible: ['inviável', 'bg-red-500/15 text-red-600 dark:text-red-400'],
    paused: ['pausada', 'bg-slate-500/15 text-slate-500 dark:text-slate-400'],
    achieved: ['alcançada', 'bg-sky2-500/15 text-sky2-600 dark:text-sky2-400'],
  };
  const [label, cls] = map[health] ?? ['?', ''];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
