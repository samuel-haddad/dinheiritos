'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import AuthGate from '@/components/AuthGate';
import HealthChip from '@/components/HealthChip';
import Nav from '@/components/Nav';
import { AppData, brl, currentNetWorth, loadAppData } from '@/lib/data';
import { GoalHealth, GoalStatus, MonthAllocation, planGoals, requiredHorizon } from '@/lib/engine/allocation';
import { formatMonth, monthRange } from '@/lib/engine/months';
import { defaultStartMonth, project } from '@/lib/engine/projection';
import { supabase } from '@/lib/supabase';
import type { Goal } from '@/lib/types';

const axis = { fontSize: 11, fill: 'currentColor' } as const;
const kfmt = (v: number) => `${Math.round(v / 1000)}k`;
const GOAL_COLORS = [
  '#22c55e', '#58a6e8', '#f97316', '#e879f9', '#eab308',
  '#14b8a6', '#f43f5e', '#8b5cf6', '#84cc16', '#06b6d4',
];
const tooltipStyle = {
  background: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 8,
  color: 'var(--tooltip-text)',
  fontSize: 12,
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
}

// ---------- modais ----------
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="btn-ghost">✕</button>
        </div>
        {children}
      </div>
    </div>
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
      <div className="space-y-3">
        <input className="input" placeholder="Nome" value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Valor alvo (R$)
            <input className="input mt-1" inputMode="decimal" value={form.target_amount}
              onChange={(e) => onChange({ ...form, target_amount: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Prazo
            <input className="input mt-1" type="month" value={form.deadline}
              onChange={(e) => onChange({ ...form, deadline: e.target.value })} />
          </label>
        </div>
        <label className="block text-xs text-slate-500 dark:text-slate-400">
          Responsável
          <select className="input mt-1" value={form.profile_id}
            onChange={(e) => onChange({ ...form, profile_id: e.target.value })}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.paused}
            onChange={(e) => onChange({ ...form, paused: e.target.checked })} /> Pausada
        </label>

        {/* Viabilidade (5.3): simula a meta contra o patrimônio + saldo livre projetado */}
        {viability ? (
          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm dark:bg-navy-900">
            <div className="flex items-center gap-2">
              <HealthChip health={viability.health} />
              <span className="font-medium">{HEALTH_LABEL[viability.health]}</span>
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              Posição estimada hoje (do patrimônio):{' '}
              <strong className="text-slate-700 dark:text-slate-200">{brl.format(viability.current)}</strong>
            </div>
            {viability.remaining > 0 && (
              <div className="text-slate-500 dark:text-slate-400">
                Aporte mínimo:{' '}
                <strong className="text-accent-600 dark:text-accent-400">{brl.format(viability.requiredMonthly)}/mês</strong>
              </div>
            )}
            {viability.projectedCompletion && (
              <div className="text-slate-500 dark:text-slate-400">
                Conclusão projetada: {formatMonth(viability.projectedCompletion)}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-400 dark:bg-navy-900">
            Preencha valor-alvo e prazo para ver a viabilidade.
          </div>
        )}

        <button onClick={onSave} disabled={saving || !form.name || !form.deadline} className="btn-primary w-full">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

// ---------- detalhe da meta ----------
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-navy-700">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-700 dark:text-slate-200">{children}</span>
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
        <div className="flex items-center gap-2">
          <HealthChip health={s.health} />
          <span className="text-sm font-medium">{HEALTH_LABEL[s.health]}</span>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-1 dark:bg-navy-900">
          <InfoRow label="Responsável">{ownerName}</InfoRow>
          <InfoRow label="Valor-alvo">{brl.format(target)}</InfoRow>
          <InfoRow label="Prazo">{formatMonth(s.goal.deadline)}</InfoRow>
          <InfoRow label="Posição atual (do patrimônio)">
            {brl.format(s.current)} <span className="text-xs text-slate-400">({pct.toFixed(0)}%)</span>
          </InfoRow>
          <InfoRow label="Faltante">{brl.format(s.remaining)}</InfoRow>
          {s.remaining > EPS && <InfoRow label="Aporte mínimo">{brl.format(s.requiredMonthly)}/mês</InfoRow>}
          <InfoRow label="Conclusão projetada">
            {s.projectedCompletion ? formatMonth(s.projectedCompletion) : 'não conclui no horizonte'}
          </InfoRow>
        </div>

        <div>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Cada barra soma a <strong>posição acumulada</strong> e o <strong>aporte estimado do mês</strong>
            (do saldo livre projetado). O topo de um mês vira a posição do mês seguinte, até cruzar o alvo.
          </p>
          <div className="text-slate-600 dark:text-slate-300">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={series} margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={axis} interval={tickEvery} />
                <YAxis tick={axis} tickFormatter={kfmt} />
                <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
                <Legend />
                <ReferenceLine
                  y={target}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: 'Alvo', position: 'insideTopRight', fontSize: 11, fill: '#f59e0b' }}
                />
                <Bar dataKey="Posição" stackId="s" fill="#58a6e8" />
                <Bar dataKey="Aporte do mês" stackId="s" fill="#22c55e" radius={[3, 3, 0, 0]} />
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
  s, ownerName, onOpen, onEdit, onMove, onDelete, first, last,
}: {
  s: GoalStatus;
  ownerName: string;
  onOpen: () => void;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  first: boolean;
  last: boolean;
}) {
  const target = Number(s.goal.target_amount);
  const pct = Math.min(100, (s.current / target) * 100);
  const active = s.health === 'on_track' || s.health === 'late' || s.health === 'infeasible';
  return (
    <div className="card">
      <div
        className="-m-1 cursor-pointer rounded-lg p-1 transition-colors hover:bg-slate-50 dark:hover:bg-navy-900/50"
        onClick={onOpen}
        title="Ver detalhes da meta"
      >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{s.goal.name}</h3>
        <HealthChip health={s.health} />
        <span className="ml-auto text-xs text-slate-400">
          {ownerName} · prazo {formatMonth(s.goal.deadline)}
          {s.projectedCompletion && active && <> · conclui {formatMonth(s.projectedCompletion)}</>}
        </span>
      </div>
      <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-navy-900">
        <div
          className={`h-full rounded-full ${
            s.health === 'achieved' ? 'bg-sky2-500'
            : s.health === 'infeasible' ? 'bg-red-500'
            : s.health === 'late' ? 'bg-amber-500'
            : 'bg-accent-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          {brl.format(s.current)} de {brl.format(target)} ({pct.toFixed(0)}%)
        </span>
        {active && (
          <span className="text-slate-500 dark:text-slate-400">
            mín. <strong className="text-slate-700 dark:text-slate-200">{brl.format(s.requiredMonthly)}/mês</strong>
            {' · '}sugerido este mês{' '}
            <strong className="text-accent-600 dark:text-accent-400">{brl.format(s.suggestedThisMonth)}</strong>
          </span>
        )}
      </div>
      </div>
      <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2 dark:border-navy-700">
        <button className="btn-ghost" onClick={onEdit}>Editar</button>
        <button className="btn-ghost" onClick={onDelete}>Excluir</button>
        <div className="ml-auto flex items-center gap-0.5 text-xs text-slate-400">
          prioridade
          <button className="btn-ghost !px-2" disabled={first} onClick={() => onMove(-1)}>↑</button>
          <button className="btn-ghost !px-2" disabled={last} onClick={() => onMove(1)}>↓</button>
        </div>
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

  if (error) return <p className="text-red-500">Erro: {error}</p>;
  if (!view || !data) return <p className="text-slate-400">Carregando metas…</p>;

  const nameOf = (pid: string) => data.profiles.find((p) => p.id === pid)?.name ?? '';
  const blank: GoalForm = {
    name: '', target_amount: '', deadline: '', start_month: toMonthInput(defaultStartMonth()),
    profile_id: data.profiles[0]?.id ?? '', paused: false,
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          A posição de cada meta vem do patrimônio (contas + investimentos), distribuído por prazo
          mais próximo, com teto no alvo — o excedente cascateia para as demais. A ordem abaixo só
          desempata quando o saldo livre do mês não cobre todos os aportes mínimos.
        </p>
        <button className="btn-primary shrink-0" onClick={() => setEditing(blank)}>+ Nova meta</button>
      </div>

      {view.plan.alerts.length > 0 && (
        <div className="mb-4 space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          {view.plan.alerts.map((a, i) => <p key={i}>⚠️ {a}</p>)}
        </div>
      )}

      {view.ordered.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Evolução estimada das metas — próximos 24 meses
          </h2>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Posição projetada de cada meta, mês a mês, sob a alocação do saldo livre. Cada linha sobe
            até o valor-alvo e estabiliza quando a meta é concluída.
          </p>
          <div className="text-slate-600 dark:text-slate-300">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={view.evolution} margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
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
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="space-y-4">
        {view.ordered.map((s, i) => (
          <GoalCard
            key={s.goal.id}
            s={s}
            ownerName={nameOf(s.goal.profile_id)}
            first={i === 0}
            last={i === view.ordered.length - 1}
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
      <main className="mx-auto max-w-5xl p-4 md:p-8">
        <Nav />
        <Goals />
      </main>
    </AuthGate>
  );
}
