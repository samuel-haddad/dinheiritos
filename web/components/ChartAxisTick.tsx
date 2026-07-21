// Rótulo do eixo X rotacionado, usado nos gráficos para evitar sobreposição de meses.
export default function RotatedTick({ x, y, payload }: { x: number; y: number; payload: { value: string } }) {
  return (
    <text
      x={x}
      y={y}
      dy={10}
      textAnchor="end"
      fontSize={11}
      fill="var(--muted)"
      transform={`rotate(-40 ${x} ${y})`}
    >
      {payload.value}
    </text>
  );
}
