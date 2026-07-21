'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import AuthGate from '@/components/AuthGate';
import HealthChip from '@/components/HealthChip';
import Shell from '@/components/Shell';
import { AppData, brl, currentNetWorth, loadAppData } from '@/lib/data';
import { GoalHealth, GoalStatus, MonthAllocation, planGoals, requiredHorizon } from '@/lib/engine/allocation';
import { formatMonth, monthRange } from '@/lib/engine/months';
import { defaultStartMonth, project } from '@/lib/engine/projection';
import { supabase } from '@/lib/supabase';
import type { Goal, GoalCategory } from '@/lib/types';

const CATEGORY_LABEL: Record<GoalCategory, string> = { gasto: 'Gasto', patrimonio: 'Patrimônio' };
const CATEGORY_HELP: Record<GoalCategory, string> = {
  gasto: 'Compromisso futuro que vai consumir patrimônio (ex.: reforma, viagem) — entra no desconto do Patrimônio Projetado.',
  patrimonio: 'Construção de patrimônio (ex.: reserva, previdência) — não desconta o Patrimônio Projetado.',
};

const axis = { fontSize: 11, fill: 'var(--muted)' } as const;
const kfmt = (v: number) => `${Math.round(v / 1000)}k`;
const GOAL_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  '#8A9A5B', '#B08968', '#6B8F71', '#A66E4E', '#4C7A73', '#C97B63',
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
  s, monthly, ownerName, onClose,
}: {
  s: GoalStatus;
  monthly: MonthAllocation[];
  ownerName: string;
  onClose: () => void;
}) {
  const EPS = 0.005;
  const target = Number(s.goal.target_amount);

  // Série mês a mês: posição acumulada (base) + aporte estimado do mês (topo).
  // posição(M+1) = posição(M) + aporte(M). Vai até o mês em que conclui.
  const series: { label: string; Posição: number; 'Aporte do mês': number }[] = [];
  let pos = s.current;
  for (const m of monthly) {
    const aporte = m.perGoal.find((p) => p.goalId === s.goal.id)?.amount ?? 0;
    if (pos >= target - EPS) break; // já concluída
    series.push({
      label: formatMonth(m.month),
      Posição: Math.round(pos * 100) / 100,
      'Aporte do mês': Math.round(aporte * 100) / 100,
    });
    pos = Math.round((pos + aporte) * 100) / 100;
    if (aporte <= EPS && series.length > 36) break; // trava de segurança
  }
  if (series.length === 0) {
    series.push({ label: formatMonth(defaultStartMonth()), Posição: Math.min(s.current, target), 'Aporte do mês': 0 });
  }

  const pct = Math.min(100, (s.current / target) * 100);
  const tickEvery = Math.max(0, Math.ceil(series.length / 12) - 1);

  return (
    <Modal title={s.goal.name} onClose={onClose} wide>
      <div className="space-y-4">
        <HealthChip health={s.health} />

        <div className="rounded-2xl px-4" style={{ background: 'var(--surface-2)' }}>
          <InfoRow label="Responsável">{ownerName}</InfoRow>
          <InfoRow label="Valor-alvo">{brl.format(target)}</InfoRow>
          <InfoRow label="Prazo">{formatMonth(s.goal.deadline)}</InfoRow>
          <InfoRow label="Posição atual (do patrimônio)">
            {brl.format(s.current)} <span className="text-xs" style={{ color: 'var(--muted)' }}>({pct.toFixed(0)}%)</span>
          </InfoRow>
          <InfoRow label="Faltante">{brl.format(s.remaining)}</InfoRow>
          {s.remaining > EPS && <InfoRow label="Aporte mínimo">{brl.format(s.requiredMonthly)}/mês</InfoRow>}
          <InfoRow label="Conclusão projetada">
            {s.projectedCompletion ? formatMonth(s.projectedCompletion) : 'não conclui no horizonte'}
          </InfoRow>
        </div>

        <div>
          <p className="mb-2.5 text-xs" style={{ color: 'var(--muted)' }}>
            Cada barra soma a <strong>posição acumulada</strong> e o <strong>aporte estimado do mês</strong>
            {' '}(do saldo livre projetado). O topo de um mês vira a posição do mês seguinte, até cruzar o alvo.
          </p>
          <div style={{ color: 'var(--ink)' }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={series} margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={axis} interval={tickEvery} />
                <YAxis tick={axis} tickFormatter={kfmt} />
                <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
                <Legend />
                <ReferenceLine
                  y={target}
                  stroke="var(--notice)"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: 'Alvo', position: 'insideTopRight', fontSize: 11, fill: 'var(--notice)' }}
                />
                <Bar dataKey="Posição" stackId="s" fill="var(--chart-2)" />
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
  s, ownerName, onOpen, onEdit, onMove, onDelete, first, last, selected, onToggleSelect,
}: {
  s: GoalStatus;
  ownerName: string;
  onOpen: () => void;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  first: boolean;
  last: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const target = Number(s.goal.target_amount);
  const pct = Math.min(100, (s.current / target) * 100);
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
            {brl.format(s.current)} de {brl.format(target)} ({pct.toFixed(0)}%)
          </span>
          {active && (
            <span className="num" style={{ color: 'var(--muted)' }}>
              mín. <strong style={{ color: 'var(--ink)' }}>{brl.format(s.requiredMonthly)}/mês</strong>
              {' · '}sugerido{' '}
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

  const reload = useCallback(() => {
    loadAppData().then(setData).catch((e) => setError(String(e)));
  }, []);
  useEffect(reload, [reload]);

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
    const long = project({ ...engineInput, horizon: requiredHorizon(data.goals, refMonth) });
    const plan = planGoals(
      data.goals,
      currentNetWorth(data),
      long.map((p) => ({ month: p.month, freeBalance: p.freeBalance })),
      refMonth
    );
    const ordered = [...plan.statuses].sort((a, b) => a.goal.priority - b.goal.priority);

    // Evolução projetada: posição de cada meta, mês a mês, nos próximos 24 meses.
    const allocByMonth = new Map(
      plan.monthly.map((m) => [m.month, new Map(m.perGoal.map((p) => [p.goalId, p.amount]))])
    );
    const runPos = new Map(plan.statuses.map((s) => [s.goal.id, s.current]));
    const evolution = monthRange(refMonth, 24).map((month) => {
      const row: Record<string, number | string> = { label: formatMonth(month) };
      const am = allocByMonth.get(month);
      for (const s of ordered) {
        const cur = runPos.get(s.goal.id) ?? 0;
        row[s.goal.id] = Math.round(cur * 100) / 100;
        const add = am?.get(s.goal.id) ?? 0;
        runPos.set(s.goal.id, Math.min(Number(s.goal.target_amount), Math.round((cur + add) * 100) / 100));
      }
      return row;
    });

    return { plan, ordered, evolution };
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
    const simGoals = [...data.goals.filter((g) => g.id !== editing.id), prospective];
    const long = project({ ...engineInput, horizon: requiredHorizon(simGoals, refMonth) });
    const plan = planGoals(
      simGoals,
      currentNetWorth(data),
      long.map((p) => ({ month: p.month, freeBalance: p.freeBalance })),
      refMonth
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

  return (
    <>
      <div className="mb-5 flex items-start gap-4">
        <p className="m-0 max-w-[540px] text-[13.5px]" style={{ color: 'var(--muted)' }}>
          A posição de cada meta vem do patrimônio (contas + investimentos), distribuído por prazo
          mais próximo, com teto no alvo — o excedente cascateia para as demais. A ordem abaixo só
          desempata quando o saldo livre do mês não cobre todos os aportes mínimos.
        </p>
        <button className="btn-primary ml-auto shrink-0" onClick={() => setEditing(blank)}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path d="M10 4v12M4 10h12" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          Nova meta
        </button>
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
            Posição projetada de cada meta, mês a mês, sob a alocação do saldo livre. Cada linha sobe
            até o valor-alvo e estabiliza quando a meta é concluída.
          </p>
          <div style={{ color: 'var(--ink)' }}>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={view.evolution} margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={axis} interval={1} />
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
            first={i === 0}
            last={i === view.ordered.length - 1}
            selected={selected.has(s.goal.id)}
            onToggleSelect={() => toggleSelect(s.goal.id)}
            onOpen={() => setDetailingId(s.goal.id)}
            onMove={(dir) => move(i, dir)}
            onDelete={() => remove(s.goal)}
            onEdit={() =>
              setEditing({
                id: s.goal.id,
                name: s.goal.name,
                target_amount: String(s.goal.target_amount),
                deadline: toMonthInput(s.goal.deadline),
                start_month: toMonthInput(s.goal.start_month),
                profile_id: s.goal.profile_id,
                paused: s.goal.paused,
                category: s.goal.category,
              })
            }
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
