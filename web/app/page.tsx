'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import Link from 'next/link';
import AuthGate from '@/components/AuthGate';
import HealthChip from '@/components/HealthChip';
import InfoTip from '@/components/InfoTip';
import Nav from '@/components/Nav';
import { AppData, brl, currentNetWorth, loadAppData } from '@/lib/data';
import { planGoals, requiredHorizon } from '@/lib/engine/allocation';
import { formatMonth } from '@/lib/engine/months';
import { DEFAULT_HORIZON, defaultStartMonth, project } from '@/lib/engine/projection';

const tooltipStyle = {
  background: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 8,
  color: 'var(--tooltip-text)',
  fontSize: 12,
};

function Dashboard() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAppData().then(setData).catch((e) => setError(String(e)));
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const startMonth = defaultStartMonth();
    const engineInput = {
      startMonth,
      initialNetWorth: currentNetWorth(data),
      recurringIncomes: data.recurringIncomes,
      oneOffIncomes: data.oneOffIncomes,
      recurringExpenses: data.recurringExpenses,
      plannedExpenses: data.plannedExpenses,
      creditCards: data.creditCards,
      cardBills: data.cardBills,
    };
    const projections = project({ ...engineInput, horizon: DEFAULT_HORIZON });
    // simulação de metas precisa alcançar o último prazo ativo
    const long = project({ ...engineInput, horizon: requiredHorizon(data.goals, startMonth) });
    const plan = planGoals(
      data.goals,
      data.goalContributions,
      long.map((p) => ({ month: p.month, freeBalance: p.freeBalance })),
      startMonth
    );
    return { projections, plan, startMonth };
  }, [data]);

  if (error) return <p className="text-red-500">Erro ao carregar dados: {error}</p>;
  if (!view) return <p className="text-slate-400">Carregando projeção…</p>;

  const cur = view.projections[0];
  const chart = view.projections.map((p) => ({ ...p, label: formatMonth(p.month) }));
  const active = view.plan.statuses.filter((s) => s.health !== 'achieved' && s.health !== 'paused');

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi title={`Receitas (${formatMonth(cur.month)})`} value={brl.format(cur.totalIncome)} g="receitas" />
        <Kpi title="Despesas" value={brl.format(cur.totalExpenses)} g="despesas" />
        <Kpi title="Saldo livre" value={brl.format(cur.freeBalance)} g="saldo-livre"
          tone={cur.freeBalance >= 0 ? 'good' : 'bad'} />
        <Kpi title="Patrimônio projetado" value={brl.format(cur.netWorth)} g="patrimonio" />
      </div>

      {view.plan.alerts.length > 0 && (
        <div className="mb-6 space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          {view.plan.alerts.map((a, i) => (
            <p key={i}>⚠️ {a}</p>
          ))}
        </div>
      )}

      <Card title="Saldo livre projetado — próximos 24 meses" g="saldo-livre">
        <div className="text-slate-600 dark:text-slate-300">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chart} margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} interval={1} />
              <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="freeBalance" name="Saldo livre" radius={[4, 4, 0, 0]}>
                {chart.map((p) => (
                  <Cell key={p.month} fill={p.freeBalance >= 0 ? '#f97316' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Patrimônio projetado" g="patrimonio">
        <div className="text-slate-600 dark:text-slate-300">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chart} margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} interval={1} />
              <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="netWorth" name="Patrimônio" stroke="#58a6e8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title={`Aportes sugeridos em ${formatMonth(cur.month)}`} g="aporte-minimo">
        {active.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma meta ativa.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-navy-700">
            {active.map((s) => (
              <li key={s.goal.id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <HealthChip health={s.health} />
                  {s.goal.name}
                  <span className="text-xs text-slate-400">mín. {brl.format(s.requiredMonthly)}/mês</span>
                </span>
                <span className="font-semibold text-accent-600 dark:text-accent-400">
                  {brl.format(s.suggestedThisMonth)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Como isso é calculado? Veja o <Link className="underline" href="/glossario/">glossário</Link>.
        </p>
      </Card>
    </>
  );
}

function Kpi({ title, value, tone, g }: { title: string; value: string; tone?: 'good' | 'bad'; g?: string }) {
  const color =
    tone === 'good' ? 'text-accent-600 dark:text-accent-400'
    : tone === 'bad' ? 'text-red-500'
    : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="card !p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {title}{' '}
        {g && <InfoTip g={g} />}
      </p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Card({ title, children, g }: { title: string; children: React.ReactNode; g?: string }) {
  return (
    <section className="card mb-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {title}{' '}
        {g && <InfoTip g={g} className="font-normal" />}
      </h2>
      {children}
    </section>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-5xl p-4 md:p-8">
        <Nav />
        <Dashboard />
      </main>
    </AuthGate>
  );
}
