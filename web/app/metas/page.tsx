'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import AuthGate from '@/components/AuthGate';
import RotatedTick from '@/components/ChartAxisTick';
import HealthChip from '@/components/HealthChip';
import Shell from '@/components/Shell';
import Toggle from '@/components/Toggle';
import { AppData, brl, currentNetWorth, loadAppData, setAllocationMode } from '@/lib/data';
import {
  GoalHealth, GoalStatus, MonthAllocation, goalsWithDeductions, plannedRealizedByGoal,
  plannedTotalByGoal, planGoals, requiredHorizon,
} from '@/lib/engine/allocation';
import { addMonths, formatMonth, monthRange } from '@/lib/engine/months';
import { defaultStartMonth, project } from '@/lib/engine/projection';
import { supabase } from '@/lib/supabase';
import type { AllocationMode, Goal, GoalCategory } from '@/lib/types';

const CATEGORY_LABEL: Record<GoalCategory, string> = { gasto: 'Gasto', patrimonio: 'Patrimônio' };
const CATEGORY_HELP: Record<GoalCategory, string> = {
  gasto: 'Compromisso futuro que vai consumir patrimônio (ex.: reforma, viagem) — entra no desconto do Patrimônio Projetado.',
  patrimonio: 'Construção de patrimônio (ex.: reserva, previdência) — não desconta o Patrimônio Projetado.',
};

const axis = { fontSize: 11, fill: 'var(--muted)' } as const;
const kfmt = (v: number) => `${Math.round(v / 1000)}k`;
const GOAL_COLORS = [
  '#12876F', '#E0A43B', '#C0553C', '#3B6FA0', '#8E5FB0',
  '#6B8F3E', '#C05C8A', '#8B5E3C', '#4A4E69', '#D1495B',
];
const tooltipStyle = {
  background: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 10,
  color: 'var(--tooltip-text)',
  fontSize: 12.5,
};

// ---------- helpers ----------
const toMonthInput = (m: string) => m.slice(0, 7); // '2026-07-01' -> '2026-07'
const fromMonthInput = (v: string) => `${v}-01`;
const DEADLINE_SHORTCUT_YEARS = [2, 5, 10];
const deadlineShortcut = (years: number) => toMonthInput(addMonths(defaultStartMonth(), years * 12));

const HEALTH_LABEL: Record<GoalHealth, string> = {
  on_track: 'No prazo',
  late: 'Vai atrasar',
  infeasible: 'Inviável no horizonte',
  paused: 'Pausada',
  achieved: 'Já alcançada',
};

interface GoalForm {
  id?: string;
  name: string;
  target_amount: string;
  deadline: string; // 'YYYY-MM'
  start_month: string;
  profile_id: string;
  paused: boolean;
  category: GoalCategory;
}

// ---------- modais ----------
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-card ${wide ? '!w-[640px]' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-[18px] font-bold" style={{ color: 'var(--ink)' }}>{title}</h3>
          <button onClick={onClose} className="btn-ghost" aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-semibold" style={{ color: 'var(--muted)' }}>{label}</span>
      {children}
    </label>
  );
}

function GoalDialog({
  form, profiles, viability, onChange, onSave, onClose, saving,
}: {
  form: GoalForm;
  profiles: { id: string; name: string }[];
  viability: GoalStatus | null; // simulação da meta com os valores do formulário
  onChange: (f: GoalForm) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <Modal title={form.id ? 'Editar meta' : 'Nova meta'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Nome da meta">
          <input className="input" placeholder="Nome" value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Valor alvo (R$)">
            <input className="input" inputMode="decimal" value={form.target_amount}
              onChange={(e) => onChange({ ...form, target_amount: e.target.value })} />
          </Field>
          <Field label="Prazo">
            <input className="input" type="month" value={form.deadline}
              onChange={(e) => onChange({ ...form, deadline: e.target.value })} />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DEADLINE_SHORTCUT_YEARS.map((years) => {
                const target = deadlineShortcut(years);
                const active = form.deadline === target;
                return (
                  <button
                    key={years}
                    type="button"
                    className={`pill-tab !px-2.5 !py-1 !text-[11px] ${active ? 'is-active' : ''}`}
                    onClick={() => onChange({ ...form, deadline: target })}
                  >
                    +{years} anos
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <Field label="Responsável">
          <select className="input" value={form.profile_id}
            onChange={(e) => onChange({ ...form, profile_id: e.target.value })}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Categoria">
          <select className="input" value={form.category}
            onChange={(e) => onChange({ ...form, category: e.target.value as GoalCategory })}>
            <option value="patrimonio">Patrimônio</option>
            <option value="gasto">Gasto</option>
          </select>
          <span className="mt-1.5 block text-[11px]" style={{ color: 'var(--muted)' }}>
            {CATEGORY_HELP[form.category]}
          </span>
        </Field>
        <label className="flex items-center gap-2.5 text-sm font-medium" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={form.paused}
            onChange={(e) => onChange({ ...form, paused: e.target.checked })}
            style={{ width: 17, height: 17, accentColor: 'var(--accent)' }} />
          Pausada
        </label>

        {/* Viabilidade (5.3): simula a meta contra o patrimônio + saldo livre projetado */}
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-2)' }}>
          {viability ? (
            <div className="space-y-1.5 text-sm">
              <HealthChip health={viability.health} />
              <div className="num" style={{ color: 'var(--muted)' }}>
                Posição estimada hoje (do patrimônio):{' '}
                <strong style={{ color: 'var(--ink)' }}>{brl.format(viability.current)}</strong>
              </div>
              {viability.remaining > 0 && (
                <div className="num" style={{ color: 'var(--muted)' }}>
                  Aporte mínimo:{' '}
                  <strong style={{ color: 'var(--accent-strong)' }}>{brl.format(viability.requiredMonthly)}/mês</strong>
                </div>
              )}
              {viability.projectedCompletion && (
                <div style={{ color: 'var(--muted)' }}>
                  Conclusão projetada: {formatMonth(viability.projectedCompletion)}
                </div>
              )}
            </div>
          ) : (
            <p className="m-0 text-[13px]" style={{ color: 'var(--muted)' }}>
              Preencha valor-alvo e prazo para ver a viabilidade.
            </p>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2.5 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={onSave} disabled={saving || !form.name || !form.deadline} className="btn-primary">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- detalhe da meta ----------
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2 text-sm last:border-0" style={{ borderColor: 'var(--line)' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="num text-right font-medium" style={{ color: 'var(--ink)' }}>{children}</span>
    </div>
  );
}

function GoalDetail({
  s, monthly, ownerName, rawTarget, realizado, previsto, onClose,
}: {
  s: GoalStatus;
  monthly: MonthAllocation[];
  ownerName: string;
  /** Meta: valor-alvo original (Reservado + Realizado + Faltante). */
  rawTarget: number;
  /** Realizado: soma de previsões vinculadas com parcela já ocorrida (período ≤ mês atual). */
  realizado: number;
  /** Previsto: soma total das previsões vinculadas (realizado + a realizar). */
  previsto: number;
  onClose: () => void;
}) {
  const EPS = 0.005;
  const reservado = s.current; // posição do patrimônio contra o alvo já líquido do Realizado
  const progresso = Math.round((reservado + realizado) * 100) / 100;

  // Série mês a mês: progresso acumulado (base) + aporte estimado do mês (topo), partindo
  // de Reservado + Realizado. posição(M+1) = posição(M) + aporte(M). Vai até concluir a Meta.
  const series: { label: string; Progresso: number; 'Aporte do mês': number }[] = [];
  let pos = progresso;
  for (const m of monthly) {
    const aporte = m.perGoal.find((p) => p.goalId === s.goal.id)?.amount ?? 0;
    if (pos >= rawTarget - EPS) break; // já concluída
    series.push({
      label: formatMonth(m.month),
      Progresso: Math.round(pos * 100) / 100,
      'Aporte do mês': Math.round(aporte * 100) / 100,
    });
    pos = Math.round((pos + aporte) * 100) / 100;
    if (aporte <= EPS && series.length > 36) break; // trava de segurança
  }
  if (series.length === 0) {
    series.push({ label: formatMonth(defaultStartMonth()), Progresso: Math.min(progresso, rawTarget), 'Aporte do mês': 0 });
  }

  const pct = rawTarget > 0 ? Math.min(100, (progresso / rawTarget) * 100) : 100;
  const tickEvery = Math.max(0, Math.ceil(series.length / 12) - 1);

  return (
    <Modal title={s.goal.name} onClose={onClose} wide>
      <div className="space-y-4">
        <HealthChip health={s.health} />

        <div className="rounded-2xl px-4" style={{ background: 'var(--surface-2)' }}>
          <InfoRow label="Responsável">{ownerName}</InfoRow>
          <InfoRow label="Meta (valor-alvo)">{brl.format(rawTarget)}</InfoRow>
          <InfoRow label="Reservado (saldo livre já reservado)">{brl.format(reservado)}</InfoRow>
          {realizado > EPS && <InfoRow label="Realizado (previsões já ocorridas)">{brl.format(realizado)}</InfoRow>}
          {previsto > EPS && <InfoRow label="Previsto (total de previsões vinculadas)">{brl.format(previsto)}</InfoRow>}
          <InfoRow label="Prazo">{formatMonth(s.goal.deadline)}</InfoRow>
          <InfoRow label="Progresso (Reservado + Realizado)">
            {brl.format(progresso)} <span className="text-xs" style={{ color: 'var(--muted)' }}>({pct.toFixed(0)}%)</span>
          </InfoRow>
          <InfoRow label="Faltante">{brl.format(s.remaining)}</InfoRow>
          {s.remaining > EPS && <InfoRow label="Aporte mínimo">{brl.format(s.requiredMonthly)}/mês</InfoRow>}
          <InfoRow label="Conclusão projetada">
            {s.projectedCompletion ? formatMonth(s.projectedCompletion) : 'não conclui no horizonte'}
          </InfoRow>
        </div>

        <div>
          <p className="mb-2.5 text-xs" style={{ color: 'var(--muted)' }}>
            Cada barra soma o <strong>progresso acumulado</strong> (Reservado + Realizado) e o{' '}
            <strong>aporte estimado do mês</strong> (do saldo livre projetado). O topo de um mês vira
            o progresso do mês seguinte, até cruzar a Meta.
          </p>
          <div style={{ color: 'var(--ink)' }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={series} margin={{ left: 12, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={<RotatedTick x={0} y={0} payload={{ value: '' }} />} interval={tickEvery} height={50} />
                <YAxis tick={axis} tickFormatter={kfmt} />
                <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
                <Legend />
                <ReferenceLine
                  y={rawTarget}
                  stroke="var(--notice)"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: 'Meta', position: 'insideTopRight', fontSize: 11, fill: 'var(--notice)' }}
                />
                <Bar dataKey="Progresso" stackId="s" fill="var(--chart-2)" />
                <Bar dataKey="Aporte do mês" stackId="s" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------- card de meta ----------
function GoalCard({
  s, ownerName, rawTarget, realizado, previsto, onOpen, onEdit, onMove, onDelete, first, last, selected, onToggleSelect, priorityMode,
}: {
  s: GoalStatus;
  ownerName: string;
  /** Meta: valor-alvo original (Reservado + Realizado + Faltante). */
  rawTarget: number;
  /** Realizado: soma de previsões vinculadas com parcela já ocorrida (período ≤ mês atual). */
  realizado: number;
  /** Previsto: soma total das previsões vinculadas (realizado + a realizar). */
  previsto: number;
  onOpen: () => void;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  first: boolean;
  last: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  priorityMode: boolean;
}) {
  const reservado = s.current; // posição do patrimônio contra o alvo já líquido do Realizado
  const progresso = Math.round((reservado + realizado) * 100) / 100;
  const pct = rawTarget > 0 ? Math.min(100, (progresso / rawTarget) * 100) : 100;
  const active = s.health === 'on_track' || s.health === 'late' || s.health === 'infeasible';
  const barColor = s.health === 'infeasible' ? 'var(--neg)' : 'var(--accent)';
  return (
    <div className="card !p-0">
      <div
        className="cursor-pointer rounded-t-[20px] p-5 transition-colors"
        onClick={onOpen}
        title="Ver detalhes da meta"
      >
        <div className="mb-3.5 flex flex-wrap items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggleSelect}
            style={{ width: 16, height: 16, accentColor: 'var(--accent)', flex: 'none' }}
          />
          <h3 className="font-display font-semibold" style={{ color: 'var(--ink)' }}>{s.goal.name}</h3>
          <HealthChip health={s.health} />
          <span className="badge" style={{ color: 'var(--muted)', background: 'var(--surface-2)' }}>
            {CATEGORY_LABEL[s.goal.category]}
          </span>
          <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
            {ownerName} · prazo {formatMonth(s.goal.deadline)}
            {s.projectedCompletion && active && <> · conclui {formatMonth(s.projectedCompletion)}</>}
          </span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="num" style={{ color: 'var(--muted)' }}>
            {brl.format(progresso)} de {brl.format(rawTarget)} ({pct.toFixed(0)}%)
            {previsto > 0.005 && (
              <span
                className="ml-1 text-[12px]"
                title="Reservado: posição do patrimônio já alocada · Realizado: previsões vinculadas com parcela já ocorrida · Previsto: total de previsões vinculadas (realizado + a realizar)"
              >
                {' – Reservado: '}{brl.format(reservado)}
                {' | Realizado: '}{brl.format(realizado)}
                {' | Previsto '}
                <strong style={{ color: 'var(--ink)' }}>{brl.format(previsto)}</strong>
              </span>
            )}
          </span>
          {active && (
            <span className="num" style={{ color: 'var(--muted)' }}>
              {!priorityMode && (
                <>
                  mín. <strong style={{ color: 'var(--ink)' }}>{brl.format(s.requiredMonthly)}/mês</strong>
                  {' · '}
                </>
              )}
              sugerido{' '}
              <strong style={{ color: 'var(--accent-strong)' }}>{brl.format(s.suggestedThisMonth)}</strong>
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button className="btn-secondary !py-1.5 !text-[12.5px]" onClick={onEdit}>Editar</button>
        <button className="btn-danger" onClick={onDelete}>Excluir</button>
        <span className="ml-auto flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--muted)' }}>
          prioridade
          <button
            className="flex h-[26px] w-[26px] items-center justify-center rounded-lg"
            style={{ background: 'var(--surface-2)', color: 'var(--ink)', opacity: first ? 0.45 : 1 }}
            disabled={first} onClick={() => onMove(-1)}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path d="M5 12l5-5 5 5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            className="flex h-[26px] w-[26px] items-center justify-center rounded-lg"
            style={{ background: 'var(--surface-2)', color: 'var(--ink)', opacity: last ? 0.45 : 1 }}
            disabled={last} onClick={() => onMove(1)}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path d="M5 8l5 5 5-5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </span>
      </div>
    </div>
  );
}

// ---------- página ----------
function Goals() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GoalForm | null>(null);
  const [detailingId, setDetailingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);

  const reload = useCallback(() => {
    loadAppData().then(setData).catch((e) => setError(String(e)));
  }, []);
  useEffect(reload, [reload]);

  async function changeMode(mode: AllocationMode) {
    if (!data || data.allocationMode === mode || modeBusy) return;
    setModeBusy(true);
    // Atualização otimista: reflete na hora; recarrega para confirmar.
    setData({ ...data, allocationMode: mode });
    try {
      await setAllocationMode(mode);
      reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setModeBusy(false);
    }
  }

  const engineInput = useMemo(() => {
    if (!data) return null;
    return {
      startMonth: defaultStartMonth(),
      initialNetWorth: currentNetWorth(data),
      recurringIncomes: data.recurringIncomes,
      oneOffIncomes: data.oneOffIncomes,
      recurringExpenses: data.recurringExpenses,
      plannedExpenses: data.plannedExpenses,
      creditCards: data.creditCards,
      cardBills: data.cardBills,
    };
  }, [data]);

  const view = useMemo(() => {
    if (!data || !engineInput) return null;
    const refMonth = defaultStartMonth();
    // Metas com o alvo líquido do Realizado em previsões vinculadas (docs/PROJECTION_ENGINE.md
    // §2) — `s.goal` em `plan.statuses` carrega esse alvo líquido daqui em diante; o
    // `target_amount` bruto (Meta, para editar e exibir) continua em `data.goals`.
    const goals = goalsWithDeductions(data.goals, data.plannedExpenses, refMonth);
    const long = project({ ...engineInput, horizon: requiredHorizon(goals, refMonth) });
    const plan = planGoals(
      goals,
      currentNetWorth(data),
      long.map((p) => ({ month: p.month, freeBalance: p.freeBalance })),
      refMonth,
      data.allocationMode
    );
    const ordered = [...plan.statuses].sort((a, b) => a.goal.priority - b.goal.priority);

    // Previsto (total vinculado) e Realizado (parcelas já ocorridas) por meta — ver
    // "Marcação do valor previsto" na tela de Metas.
    const previsto = plannedTotalByGoal(data.plannedExpenses);
    const realizado = plannedRealizedByGoal(data.plannedExpenses, refMonth);
    const rawTargetById = new Map(data.goals.map((g) => [g.id, Number(g.target_amount)]));

    // Evolução projetada: progresso (Reservado + Realizado) de cada meta, mês a mês, nos
    // próximos 24 meses, até o valor-alvo original (Meta).
    const allocByMonth = new Map(
      plan.monthly.map((m) => [m.month, new Map(m.perGoal.map((p) => [p.goalId, p.amount]))])
    );
    const runPos = new Map(
      plan.statuses.map((s) => [s.goal.id, s.current + (realizado.get(s.goal.id) ?? 0)])
    );
    const evolution = monthRange(refMonth, 24).map((month) => {
      const row: Record<string, number | string> = { label: formatMonth(month) };
      const am = allocByMonth.get(month);
      for (const s of ordered) {
        const cur = runPos.get(s.goal.id) ?? 0;
        row[s.goal.id] = Math.round(cur * 100) / 100;
        const add = am?.get(s.goal.id) ?? 0;
        const cap = rawTargetById.get(s.goal.id) ?? Number(s.goal.target_amount);
        runPos.set(s.goal.id, Math.min(cap, Math.round((cur + add) * 100) / 100));
      }
      return row;
    });

    return { plan, ordered, evolution, previsto, realizado, rawTargetById };
  }, [data, engineInput]);

  // Viabilidade da meta em edição/criação (5.3): simula a lista com a meta prospectiva.
  const viability = useMemo<GoalStatus | null>(() => {
    if (!data || !engineInput || !editing) return null;
    const target = parseFloat(editing.target_amount.replace(',', '.')) || 0;
    if (!editing.deadline || target <= 0) return null;
    const refMonth = defaultStartMonth();
    const prospective: Goal = {
      id: editing.id ?? '__new__',
      profile_id: editing.profile_id,
      name: editing.name || 'Nova meta',
      target_amount: target,
      priority: data.goals.find((g) => g.id === editing.id)?.priority ?? data.goals.length + 1,
      paused: editing.paused,
      category: editing.category,
      start_month: fromMonthInput(editing.start_month || toMonthInput(refMonth)),
      deadline: fromMonthInput(editing.deadline),
    };
    const simGoals = goalsWithDeductions(
      [...data.goals.filter((g) => g.id !== editing.id), prospective],
      data.plannedExpenses,
      refMonth
    );
    const long = project({ ...engineInput, horizon: requiredHorizon(simGoals, refMonth) });
    const plan = planGoals(
      simGoals,
      currentNetWorth(data),
      long.map((p) => ({ month: p.month, freeBalance: p.freeBalance })),
      refMonth,
      data.allocationMode
    );
    return plan.statuses.find((s) => s.goal.id === prospective.id) ?? null;
  }, [data, engineInput, editing]);

  async function saveGoal() {
    if (!editing) return;
    setSaving(true);
    const row = {
      name: editing.name,
      target_amount: parseFloat(editing.target_amount.replace(',', '.')),
      deadline: fromMonthInput(editing.deadline),
      start_month: editing.start_month ? fromMonthInput(editing.start_month) : defaultStartMonth(),
      profile_id: editing.profile_id,
      paused: editing.paused,
      category: editing.category,
    };
    const db = supabase();
    const { error } = editing.id
      ? await db.from('goals').update(row).eq('id', editing.id)
      : await db.from('goals').insert({ ...row, priority: (data?.goals.length ?? 0) + 1 });
    setSaving(false);
    if (error) setError(error.message);
    else { setEditing(null); reload(); }
  }

  async function move(idx: number, dir: -1 | 1) {
    if (!view) return;
    const a = view.ordered[idx].goal;
    const b = view.ordered[idx + dir]?.goal;
    if (!b) return;
    const db = supabase();
    await db.from('goals').update({ priority: b.priority }).eq('id', a.id);
    await db.from('goals').update({ priority: a.priority }).eq('id', b.id);
    reload();
  }

  async function remove(goal: Goal) {
    if (!confirm(`Excluir a meta "${goal.name}"?`)) return;
    const { error } = await supabase().from('goals').delete().eq('id', goal.id);
    if (error) setError(error.message);
    reload();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`Excluir ${ids.length} meta(s)?`)) return;
    setBulkBusy(true);
    const { error } = await supabase().from('goals').delete().in('id', ids);
    setBulkBusy(false);
    if (error) setError(error.message);
    else setSelected(new Set());
    reload();
  }

  async function bulkSetPaused(ids: string[], paused: boolean) {
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase().from('goals').update({ paused }).in('id', ids);
    setBulkBusy(false);
    if (error) setError(error.message);
    else setSelected(new Set());
    reload();
  }

  if (error) return <p style={{ color: 'var(--neg)' }}>Erro: {error}</p>;
  if (!view || !data) return <p style={{ color: 'var(--muted)' }}>Carregando metas…</p>;

  const allIds = view.ordered.map((s) => s.goal.id);
  const selectedIds = allIds.filter((id) => selected.has(id));
  const allSelected = allIds.length > 0 && selectedIds.length === allIds.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const nameOf = (pid: string) => data.profiles.find((p) => p.id === pid)?.name ?? '';
  const blank: GoalForm = {
    name: '', target_amount: '', deadline: '', start_month: toMonthInput(defaultStartMonth()),
    profile_id: data.profiles[0]?.id ?? '', paused: false, category: 'patrimonio',
  };

  const isPriority = data.allocationMode === 'priority';

  return (
    <>
      <div className="card mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display m-0 mb-1 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
              Distribuição dos aportes
            </h2>
            <p className="m-0 max-w-[560px] text-[12.5px]" style={{ color: 'var(--muted)' }}>
              {isPriority
                ? 'Prioridade: todo o saldo livre vai para a meta de maior prioridade até 100%; o excedente cascateia para a próxima. A ordem das metas abaixo define quem recebe primeiro.'
                : 'Aporte mínimo: cada meta ativa recebe o mínimo para fechar no prazo; o excedente vai à meta de prazo mais próximo. A prioridade só desempata quando o saldo não cobre todos os mínimos.'}
            </p>
          </div>
          <Toggle
            on={!isPriority}
            onChange={(on) => changeMode(on ? 'am' : 'priority')}
            onLabel="Aporte mínimo"
            offLabel="Prioridade"
          />
        </div>
      </div>

      {view.plan.alerts.length > 0 && (
        <div className="mb-4 space-y-1">
          {view.plan.alerts.map((a, i) => (
            <div key={i} className="alert-box">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flex: 'none', marginTop: 1 }}>
                <path d="M10 2.5 18.5 17H1.5L10 2.5Z" stroke="var(--notice)" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M10 8v4M10 14.3v.2" stroke="var(--notice)" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}

      {view.ordered.length > 0 && (
        <section className="card mb-5">
          <h2 className="font-display m-0 mb-1 text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>
            Evolução estimada das metas
          </h2>
          <p className="m-0 mb-4 text-[13px]" style={{ color: 'var(--muted)' }}>
            Progresso projetado de cada meta (Reservado + Realizado), mês a mês, sob a alocação do
            saldo livre. Cada linha sobe até a Meta e estabiliza quando a meta é concluída.
          </p>
          <div style={{ color: 'var(--ink)' }}>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={view.evolution} margin={{ left: 12, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={<RotatedTick x={0} y={0} payload={{ value: '' }} />} interval={1} height={50} />
                <YAxis tick={axis} tickFormatter={kfmt} />
                <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
                <Legend />
                {view.ordered.map((s, i) => (
                  <Line
                    key={s.goal.id}
                    type="monotone"
                    dataKey={s.goal.id}
                    name={s.goal.name}
                    stroke={GOAL_COLORS[i % GOAL_COLORS.length]}
                    strokeWidth={2.5}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="mb-5 flex justify-end">
        <button className="btn-primary shrink-0" onClick={() => setEditing(blank)}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path d="M10 4v12M4 10h12" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          Nova meta
        </button>
      </div>

      {view.ordered.length > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-3">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())}
            title="Selecionar todas"
            style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
          />
          <span className="text-[13px] font-medium" style={{ color: 'var(--muted)' }}>Selecionar todas</span>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div
          className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-2xl px-4 py-2.5"
          style={{ background: 'var(--nav-active-bg)' }}
        >
          <span className="text-[13px] font-semibold" style={{ color: 'var(--accent-strong)' }}>
            {selectedIds.length} selecionada(s)
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              className="btn-secondary !py-1.5 !text-[12.5px]"
              disabled={bulkBusy}
              onClick={() => bulkSetPaused(selectedIds, true)}
            >
              Pausar
            </button>
            <button
              className="btn-secondary !py-1.5 !text-[12.5px]"
              disabled={bulkBusy}
              onClick={() => bulkSetPaused(selectedIds, false)}
            >
              Retomar
            </button>
            <button className="btn-danger" disabled={bulkBusy} onClick={() => bulkDelete(selectedIds)}>
              Excluir
            </button>
            <button className="btn-ghost" onClick={() => setSelected(new Set())}>
              Cancelar seleção
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3.5">
        {view.ordered.map((s, i) => (
          <GoalCard
            key={s.goal.id}
            s={s}
            ownerName={nameOf(s.goal.profile_id)}
            rawTarget={view.rawTargetById.get(s.goal.id) ?? Number(s.goal.target_amount)}
            realizado={view.realizado.get(s.goal.id) ?? 0}
            previsto={view.previsto.get(s.goal.id) ?? 0}
            first={i === 0}
            last={i === view.ordered.length - 1}
            priorityMode={isPriority}
            selected={selected.has(s.goal.id)}
            onToggleSelect={() => toggleSelect(s.goal.id)}
            onOpen={() => setDetailingId(s.goal.id)}
            onMove={(dir) => move(i, dir)}
            onDelete={() => remove(s.goal)}
            onEdit={() => {
              // s.goal carrega o alvo LÍQUIDO (deduzido de previsões vinculadas) — o
              // formulário de edição deve ler/gravar sempre o target_amount ORIGINAL.
              const raw = data.goals.find((g) => g.id === s.goal.id) ?? s.goal;
              setEditing({
                id: raw.id,
                name: raw.name,
                target_amount: String(raw.target_amount),
                deadline: toMonthInput(raw.deadline),
                start_month: toMonthInput(raw.start_month),
                profile_id: raw.profile_id,
                paused: raw.paused,
                category: raw.category,
              });
            }}
          />
        ))}
      </div>

      {editing && (
        <GoalDialog
          form={editing}
          profiles={data.profiles}
          viability={viability}
          onChange={setEditing}
          onSave={saveGoal}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      )}

      {detailingId && (() => {
        const sd = view.ordered.find((x) => x.goal.id === detailingId);
        if (!sd) return null;
        return (
          <GoalDetail
            s={sd}
            monthly={view.plan.monthly}
            ownerName={nameOf(sd.goal.profile_id)}
            rawTarget={view.rawTargetById.get(sd.goal.id) ?? Number(sd.goal.target_amount)}
            realizado={view.realizado.get(sd.goal.id) ?? 0}
            previsto={view.previsto.get(sd.goal.id) ?? 0}
            onClose={() => setDetailingId(null)}
          />
        );
      })()}
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Shell>
        <Goals />
      </Shell>
    </AuthGate>
  );
}
