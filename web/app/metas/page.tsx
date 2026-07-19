'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import HealthChip from '@/components/HealthChip';
import Nav from '@/components/Nav';
import { AppData, brl, currentNetWorth, loadAppData } from '@/lib/data';
import { GoalStatus, planGoals, requiredHorizon } from '@/lib/engine/allocation';
import { diffMonths, formatMonth } from '@/lib/engine/months';
import { defaultStartMonth, project } from '@/lib/engine/projection';
import { supabase } from '@/lib/supabase';
import type { Goal } from '@/lib/types';

// ---------- helpers ----------
const toMonthInput = (m: string) => m.slice(0, 7); // '2026-07-01' -> '2026-07'
const fromMonthInput = (v: string) => `${v}-01`;

interface GoalForm {
  id?: string;
  name: string;
  target_amount: string;
  deadline: string; // 'YYYY-MM'
  start_month: string;
  profile_id: string;
  paused: boolean;
  achieved: boolean;
}

// ---------- modais ----------
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
  form, profiles, remainingNow, onChange, onSave, onClose, saving,
}: {
  form: GoalForm;
  profiles: { id: string; name: string }[];
  remainingNow: number; // faltante atual (para simulador de AM)
  onChange: (f: GoalForm) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  // Simulador "e se": AM com os valores do formulário
  const refMonth = defaultStartMonth();
  const target = parseFloat(form.target_amount.replace(',', '.')) || 0;
  const already = form.id ? Math.max(0, target - remainingNow) : 0;
  const months = form.deadline ? Math.max(1, diffMonths(refMonth, fromMonthInput(form.deadline))) : 1;
  const am = Math.max(0, target - already) / months;

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
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.paused}
              onChange={(e) => onChange({ ...form, paused: e.target.checked })} /> Pausada
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.achieved}
              onChange={(e) => onChange({ ...form, achieved: e.target.checked })} /> Alcançada
          </label>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-navy-900">
          Com esses valores, o aporte mínimo é{' '}
          <strong className="text-accent-600 dark:text-accent-400">{brl.format(am)}/mês</strong>{' '}
          por {months} meses.
        </div>
        <button onClick={onSave} disabled={saving || !form.name || !form.deadline} className="btn-primary w-full">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

function ContributionDialog({
  goal, onDone, onClose,
}: { goal: Goal; onDone: () => void; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(toMonthInput(defaultStartMonth()));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const { error } = await supabase().from('goal_contributions').insert({
      goal_id: goal.id,
      month: fromMonthInput(month),
      amount: parseFloat(amount.replace(',', '.')),
      note: note || null,
    });
    setSaving(false);
    if (error) setError(error.message);
    else { onDone(); onClose(); }
  }

  return (
    <Modal title={`Aporte — ${goal.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Valor (R$)
            <input className="input mt-1" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Mês
            <input className="input mt-1" type="month" value={month}
              onChange={(e) => setMonth(e.target.value)} />
          </label>
        </div>
        <input className="input" placeholder="Observação (opcional)" value={note}
          onChange={(e) => setNote(e.target.value)} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button onClick={save} disabled={saving || !amount} className="btn-primary w-full">
          {saving ? 'Salvando…' : 'Registrar aporte'}
        </button>
      </div>
    </Modal>
  );
}

// ---------- card de meta ----------
function GoalCard({
  s, ownerName, onEdit, onContribute, onMove, onDelete, first, last,
}: {
  s: GoalStatus;
  ownerName: string;
  onEdit: () => void;
  onContribute: () => void;
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
      <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2 dark:border-navy-700">
        <button className="btn-ghost" onClick={onContribute}>+ Aporte</button>
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
  const [contributing, setContributing] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    loadAppData().then(setData).catch((e) => setError(String(e)));
  }, []);
  useEffect(reload, [reload]);

  const view = useMemo(() => {
    if (!data) return null;
    const refMonth = defaultStartMonth();
    const long = project({
      startMonth: refMonth,
      horizon: requiredHorizon(data.goals, refMonth),
      initialNetWorth: currentNetWorth(data),
      recurringIncomes: data.recurringIncomes,
      oneOffIncomes: data.oneOffIncomes,
      recurringExpenses: data.recurringExpenses,
      plannedExpenses: data.plannedExpenses,
      creditCards: data.creditCards,
      cardBills: data.cardBills,
    });
    const plan = planGoals(
      data.goals,
      data.goalContributions,
      long.map((p) => ({ month: p.month, freeBalance: p.freeBalance })),
      refMonth
    );
    const ordered = [...plan.statuses].sort((a, b) => a.goal.priority - b.goal.priority);
    return { plan, ordered };
  }, [data]);

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
      achieved: editing.achieved,
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
    if (!confirm(`Excluir a meta "${goal.name}" e seus aportes registrados?`)) return;
    const db = supabase();
    await db.from('goal_contributions').delete().eq('goal_id', goal.id);
    const { error } = await db.from('goals').delete().eq('id', goal.id);
    if (error) setError(error.message);
    reload();
  }

  if (error) return <p className="text-red-500">Erro: {error}</p>;
  if (!view || !data) return <p className="text-slate-400">Carregando metas…</p>;

  const nameOf = (pid: string) => data.profiles.find((p) => p.id === pid)?.name ?? '';
  const blank: GoalForm = {
    name: '', target_amount: '', deadline: '', start_month: toMonthInput(defaultStartMonth()),
    profile_id: data.profiles[0]?.id ?? '', paused: false, achieved: false,
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sem pesos: cada meta tem um aporte mínimo automático (faltante ÷ meses até o prazo).
          A ordem abaixo só desempata quando o saldo do mês não cobre todos os mínimos.
        </p>
        <button className="btn-primary shrink-0" onClick={() => setEditing(blank)}>+ Nova meta</button>
      </div>

      {view.plan.alerts.length > 0 && (
        <div className="mb-4 space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          {view.plan.alerts.map((a, i) => <p key={i}>⚠️ {a}</p>)}
        </div>
      )}

      <div className="space-y-4">
        {view.ordered.map((s, i) => (
          <GoalCard
            key={s.goal.id}
            s={s}
            ownerName={nameOf(s.goal.profile_id)}
            first={i === 0}
            last={i === view.ordered.length - 1}
            onMove={(dir) => move(i, dir)}
            onContribute={() => setContributing(s.goal)}
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
                achieved: s.goal.achieved,
              })
            }
          />
        ))}
      </div>

      {editing && (
        <GoalDialog
          form={editing}
          profiles={data.profiles}
          remainingNow={view.ordered.find((s) => s.goal.id === editing.id)?.remaining ?? 0}
          onChange={setEditing}
          onSave={saveGoal}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      )}
      {contributing && (
        <ContributionDialog goal={contributing} onDone={reload} onClose={() => setContributing(null)} />
      )}
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
