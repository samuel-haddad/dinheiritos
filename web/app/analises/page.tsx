'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import AuthGate from '@/components/AuthGate';
import InfoTip from '@/components/InfoTip';
import Nav from '@/components/Nav';
import Tabs from '@/components/Tabs';
import { AppData, currentNetWorth, loadAppData } from '@/lib/data';
import { brl } from '@/lib/format';
import { planGoals, requiredHorizon } from '@/lib/engine/allocation';
import { formatMonth } from '@/lib/engine/months';
import { DEFAULT_HORIZON, defaultStartMonth, project } from '@/lib/engine/projection';

const TABS = ['Receita × Despesa', 'Composição das despesas', 'Aportes', 'Acumulados', 'Tabela saldo'];
const TAB_GLOSSARY: Record<string, string | string[]> = {
  'Receita × Despesa': ['receitas', 'despesas'],
  'Composição das despesas': 'composicao-despesas',
  Aportes: 'alocacao',
  Acumulados: 'acumulados',
  'Tabela saldo': 'tabela-saldo',
};
const tooltipStyle = {
  background: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 8,
  color: 'var(--tooltip-text)',
  fontSize: 12,
};
const axis = { fontSize: 11, fill: 'currentColor' } as const;
const kfmt = (v: number) => `${Math.round(v / 1000)}k`;
const GOAL_COLORS = [
  '#22c55e', '#58a6e8', '#f97316', '#e879f9', '#eab308',
  '#14b8a6', '#f43f5e', '#8b5cf6', '#84cc16', '#06b6d4',
];

function Analises() {
  const [tab, setTab] = useState(TABS[0]);
  const [focus, setFocus] = useState<string | null>(null); // meta destacada no gráfico de aportes
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAppData().then(setData).catch((e) => setError(String(e)));
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const startMonth = defaultStartMonth();
    const input = {
      startMonth,
      initialNetWorth: currentNetWorth(data),
      recurringIncomes: data.recurringIncomes,
      oneOffIncomes: data.oneOffIncomes,
      recurringExpenses: data.recurringExpenses,
      plannedExpenses: data.plannedExpenses,
      creditCards: data.creditCards,
      cardBills: data.cardBills,
    };
    const proj = project({ ...input, horizon: DEFAULT_HORIZON });
    const long = project({ ...input, horizon: requiredHorizon(data.goals, startMonth) });
    const plan = planGoals(
      data.goals,
      data.goalContributions,
      long.map((p) => ({ month: p.month, freeBalance: p.freeBalance })),
      startMonth
    );
    const allocByMonth = new Map(
      plan.monthly.map((m) => [m.month, m.perGoal.reduce((s, g) => s + g.amount, 0)])
    );

    // Aportes por meta, mês a mês (para o gráfico empilhado)
    const goalNameById = new Map(data.goals.map((g) => [g.id, g.name]));
    const perGoalByMonth = new Map<string, Record<string, number>>();
    for (const m of plan.monthly) {
      const rec: Record<string, number> = {};
      for (const pg of m.perGoal) {
        const nm = goalNameById.get(pg.goalId) ?? pg.goalId;
        rec[nm] = (rec[nm] ?? 0) + pg.amount;
      }
      perGoalByMonth.set(m.month, rec);
    }
    const displayed = new Set(proj.map((p) => p.month));
    const goalTotals = new Map<string, number>();
    for (const [month, rec] of perGoalByMonth) {
      if (!displayed.has(month)) continue;
      for (const [nm, v] of Object.entries(rec)) goalTotals.set(nm, (goalTotals.get(nm) ?? 0) + v);
    }
    const goalNames = data.goals
      .map((g) => g.name)
      .filter((nm) => (goalTotals.get(nm) ?? 0) > 0.005);

    let accAporte = 0;
    let accPrevisoes = 0;
    let accDespesas = 0;
    const chart = proj.map((p) => {
      const pg = perGoalByMonth.get(p.month) ?? {};
      const aportes = allocByMonth.get(p.month) ?? 0;
      accAporte += aportes;
      accPrevisoes += p.plannedInstallments;
      accDespesas += p.totalExpenses;
      const recorrentes = p.totalExpenses - p.cardExpenses - p.plannedInstallments;
      const goalCols: Record<string, number> = {};
      for (const nm of goalNames) goalCols[nm] = Math.round((pg[nm] ?? 0) * 100) / 100;
      return {
        label: formatMonth(p.month),
        month: p.month,
        Receitas: p.totalIncome,
        Despesas: p.totalExpenses,
        Recorrentes: Math.round(recorrentes * 100) / 100,
        Faturas: p.cardExpenses,
        Parcelas: p.plannedInstallments,
        'Aportes acumulados': Math.round(accAporte * 100) / 100,
        'Previsões acumuladas': Math.round(accPrevisoes * 100) / 100,
        'Despesas acumuladas': Math.round(accDespesas * 100) / 100,
        ...goalCols,
      };
    });

    // Tabela: meses fechados (reais) + projeção dali em diante
    const closed = data.monthlyProjections
      .filter((m) => m.is_closed && m.month < startMonth)
      .map((m) => ({
        month: m.month,
        receitas: Number(m.total_income),
        despesas: Number(m.total_expenses),
        saldo: Number(m.free_balance),
        aportes: Number(m.goal_allocation),
        patrimonio: Number(m.net_worth),
        real: true,
      }));
    const projected = proj.map((p) => ({
      month: p.month,
      receitas: p.totalIncome,
      despesas: p.totalExpenses,
      saldo: p.freeBalance,
      aportes: allocByMonth.get(p.month) ?? 0,
      patrimonio: p.netWorth,
      real: false,
    }));
    return { chart, table: [...closed, ...projected], goalNames };
  }, [data]);

  if (error) return <p className="text-red-500">Erro: {error}</p>;
  if (!view) return <p className="text-slate-400">Carregando análises…</p>;

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">Análises</h1>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="mb-3 flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
        {tab}
        <InfoTip g={TAB_GLOSSARY[tab]} />
      </div>

      <div className="card text-slate-600 dark:text-slate-300">
        {tab === 'Receita × Despesa' && (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={view.chart} margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
              <XAxis dataKey="label" tick={axis} interval={1} />
              <YAxis tick={axis} tickFormatter={kfmt} />
              <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="Receitas" fill="#58a6e8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Despesas" fill="#f97316" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {tab === 'Composição das despesas' && (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={view.chart} margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
              <XAxis dataKey="label" tick={axis} interval={1} />
              <YAxis tick={axis} tickFormatter={kfmt} />
              <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="Receitas" stackId="r" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Recorrentes" stackId="d" fill="#64748b" />
              <Bar dataKey="Faturas" stackId="d" fill="#f97316" />
              <Bar dataKey="Parcelas" stackId="d" fill="#e879f9" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {tab === 'Aportes' &&
          (view.goalNames.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              Nenhum aporte sugerido no período — todas as metas estão pausadas, alcançadas ou sem saldo livre.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-400">
                Clique numa meta (barra ou legenda) para destacá-la; clique de novo para limpar.
              </p>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={view.chart} margin={{ left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                  <XAxis dataKey="label" tick={axis} interval={1} />
                  <YAxis tick={axis} tickFormatter={kfmt} />
                  <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
                  <Legend
                    onClick={(e: any) => {
                      const k = String(e.dataKey ?? e.value);
                      setFocus((f) => (f === k ? null : k));
                    }}
                  />
                  {view.goalNames.map((nm, i) => (
                    <Bar
                      key={nm}
                      dataKey={nm}
                      stackId="ap"
                      fill={GOAL_COLORS[i % GOAL_COLORS.length]}
                      fillOpacity={focus && focus !== nm ? 0.2 : 1}
                      onClick={() => setFocus((f) => (f === nm ? null : nm))}
                      radius={i === view.goalNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </>
          ))}

        {tab === 'Acumulados' && (
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={view.chart} margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
              <XAxis dataKey="label" tick={axis} interval={1} />
              <YAxis tick={axis} tickFormatter={kfmt} />
              <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
              <Legend />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Area dataKey="Despesas acumuladas" stroke="#f97316" fill="#f97316" fillOpacity={0.12} />
              <Area dataKey="Previsões acumuladas" stroke="#e879f9" fill="#e879f9" fillOpacity={0.15} />
              <Area dataKey="Aportes acumulados" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {tab === 'Tabela saldo' && (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-navy-700">
                  <th className="px-4 py-3">Mês</th>
                  <th className="px-4 py-3 text-right">Receitas</th>
                  <th className="px-4 py-3 text-right">Despesas</th>
                  <th className="px-4 py-3 text-right">Saldo livre</th>
                  <th className="px-4 py-3 text-right">Aportes</th>
                  <th className="px-4 py-3 text-right">Patrimônio</th>
                  <th className="px-4 py-3">Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-700">
                {view.table.map((r) => (
                  <tr key={r.month} className={r.real ? '' : 'opacity-90'}>
                    <td className="px-4 py-2">{formatMonth(r.month)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{brl.format(r.receitas)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{brl.format(r.despesas)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${r.saldo < 0 ? 'text-red-500' : ''}`}>
                      {brl.format(r.saldo)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{brl.format(r.aportes)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{brl.format(r.patrimonio)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.real
                            ? 'bg-sky2-500/15 text-sky2-600 dark:text-sky2-400'
                            : 'bg-slate-500/15 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {r.real ? 'real' : 'projetado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-6xl p-4 md:p-8">
        <Nav />
        <Analises />
      </main>
    </AuthGate>
  );
}
