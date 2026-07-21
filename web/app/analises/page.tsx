'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import AuthGate from '@/components/AuthGate';
import InfoTip from '@/components/InfoTip';
import Shell from '@/components/Shell';
import Tabs from '@/components/Tabs';
import { AppData, currentNetWorth, loadAppData } from '@/lib/data';
import { brl } from '@/lib/format';
import { planGoals, projectedWealth, requiredHorizon } from '@/lib/engine/allocation';
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
  borderRadius: 10,
  color: 'var(--tooltip-text)',
  fontSize: 12.5,
};
const axis = { fontSize: 11, fill: 'var(--muted)' } as const;
const kfmt = (v: number) => `${Math.round(v / 1000)}k`;
const GOAL_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  '#8A9A5B', '#B08968', '#6B8F71', '#A66E4E', '#4C7A73', '#C97B63',
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
      currentNetWorth(data),
      long.map((p) => ({ month: p.month, freeBalance: p.freeBalance })),
      startMonth
    );
    const allocByMonth = new Map(
      plan.monthly.map((m) => [m.month, m.perGoal.reduce((s, g) => s + g.amount, 0)])
    );
    // Patrimônio Projetado ajustado (docs/PROJECTION_ENGINE.md §1) — mesmo desconto do Dashboard.
    const wealthByMonth = new Map(
      projectedWealth(
        proj.map((p) => ({ month: p.month, netWorth: p.netWorth })),
        data.goals,
        plan
      ).map((w) => [w.month, w.netWorth])
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
      patrimonio: wealthByMonth.get(p.month) ?? p.netWorth,
      real: false,
    }));
    return { chart, table: [...closed, ...projected], goalNames };
  }, [data]);

  if (error) return <p style={{ color: 'var(--neg)' }}>Erro: {error}</p>;
  if (!view) return <p style={{ color: 'var(--muted)' }}>Carregando análises…</p>;

  return (
    <>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="mb-3 flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
        {tab}
        <InfoTip g={TAB_GLOSSARY[tab]} />
      </div>

      <div className="card">
        {tab === 'Receita × Despesa' && (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={view.chart} margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={axis} interval={1} />
              <YAxis tick={axis} tickFormatter={kfmt} />
              <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="Receitas" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Despesas" fill="var(--stack-1)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {tab === 'Composição das despesas' && (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={view.chart} margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={axis} interval={1} />
              <YAxis tick={axis} tickFormatter={kfmt} />
              <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
              <Legend />
              <Bar dataKey="Recorrentes" stackId="d" fill="var(--stack-1)" />
              <Bar dataKey="Faturas" stackId="d" fill="var(--stack-2)" />
              <Bar dataKey="Parcelas" stackId="d" fill="var(--stack-3)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {tab === 'Aportes' &&
          (view.goalNames.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
              Nenhum aporte sugerido no período — todas as metas estão pausadas, alcançadas ou sem saldo livre.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
                Clique numa meta (barra ou legenda) para destacá-la; clique de novo para limpar.
              </p>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={view.chart} margin={{ left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
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
                      fillOpacity={focus && focus !== nm ? 0.25 : 1}
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
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={axis} interval={1} />
              <YAxis tick={axis} tickFormatter={kfmt} />
              <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
              <Legend />
              <ReferenceLine y={0} stroke="var(--line)" />
              <Area dataKey="Despesas acumuladas" stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.12} />
              <Area dataKey="Previsões acumuladas" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.15} />
              <Area dataKey="Aportes acumulados" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {tab === 'Tabela saldo' && (
          <div className="-m-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
                  <th className="px-4 py-3">Mês</th>
                  <th className="px-4 py-3 text-right">Receitas</th>
                  <th className="px-4 py-3 text-right">Despesas</th>
                  <th className="px-4 py-3 text-right">Saldo livre</th>
                  <th className="px-4 py-3 text-right">Aportes</th>
                  <th className="px-4 py-3 text-right">Patrimônio</th>
                  <th className="px-4 py-3">Origem</th>
                </tr>
              </thead>
              <tbody>
                {view.table.map((r) => (
                  <tr key={r.month} className="border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-4 py-2.5">{formatMonth(r.month)}</td>
                    <td className="num px-4 py-2.5 text-right">{brl.format(r.receitas)}</td>
                    <td className="num px-4 py-2.5 text-right">{brl.format(r.despesas)}</td>
                    <td className="num px-4 py-2.5 text-right" style={{ color: r.saldo < 0 ? 'var(--neg)' : 'var(--ink)' }}>
                      {brl.format(r.saldo)}
                    </td>
                    <td className="num px-4 py-2.5 text-right">{brl.format(r.aportes)}</td>
                    <td className="num px-4 py-2.5 text-right">{brl.format(r.patrimonio)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="badge"
                        style={{
                          color: r.real ? 'var(--accent-strong)' : 'var(--muted)',
                          background: r.real
                            ? 'color-mix(in srgb, var(--accent-strong) 15%, transparent)'
                            : 'var(--surface-2)',
                        }}
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
      <Shell>
        <Analises />
      </Shell>
    </AuthGate>
  );
}
