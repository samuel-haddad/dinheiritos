const HEALTH_MAP: Record<string, { label: string; varName: string }> = {
  on_track: { label: 'no prazo', varName: '--pos' },
  late: { label: 'vai atrasar', varName: '--notice' },
  infeasible: { label: 'inviável', varName: '--neg' },
  paused: { label: 'pausada', varName: '--muted' },
  achieved: { label: 'alcançada', varName: '--accent-strong' },
};

export default function HealthChip({ health }: { health: string }) {
  const entry = HEALTH_MAP[health] ?? { label: '?', varName: '--muted' };
  const color = `var(${entry.varName})`;
  return (
    <span
      className="badge"
      style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
    >
      {entry.label}
    </span>
  );
}
