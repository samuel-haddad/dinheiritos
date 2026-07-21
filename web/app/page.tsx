'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import Link from 'next/link';
import AuthGate from '@/components/AuthGate';
import HealthChip from '@/components/HealthChip';
import InfoTip from '@/components/InfoTip';
import Shell from '@/components/Shell';
import { AppData, brl, currentNetWorth, loadAppData } from '@/lib/data';
import { planGoals, projectedWealth, requiredHorizon } from '@/lib/engine/allocation';
import { formatMonth } from '@/lib/engine/months';
import { DEFAULT_HORIZON, defaultStartMonth, project } from '@/lib/engine/projection';

const tooltipStyle = {
  background: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 10,
  color: 'var(--tooltip-text)',
  fontSize: 12.5,
};
const axis = { fontSize: 11, fill: 'var(--muted)' } as const;

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
      currentNetWorth(data),
      long.map((p) => ({ month: p.month, freeBalance: p.freeBalance })),
      startMonth
    );
    // Patrimônio Projetado ajustado: desconta o reservado para metas de categoria "gasto"
    // (docs/PROJECTION_ENGINE.md §1). Metas "patrimonio" não afetam este número.
    const wealth = projectedWealth(
      projections.map((p) => ({ month: p.month, netWorth: p.netWorth })),
      data.goals,
      plan
    );
    return { projections, plan, wealth, startMonth };
  }, [data]);

  if (error) return <p style={{ color: 'var(--neg)' }}>Erro ao carregar dados: {error}</p>;
  if (!view) return <p style={{ color: 'var(--muted)' }}>Carregando projeção…</p>;

  const cur = view.projections[0];
  const curWealth = view.wealth[0];
  const wealthByMonth = new Map(view.wealth.map((w) => [w.month, w.netWorth]));
  let accFree = 0;
  const chart = view.projections.map((p) => {
    accFree += p.freeBalance;
    return {
      ...p,
      label: formatMonth(p.month),
      saldoAcumulado: Math.round(accFree * 100) / 100,
      netWorth: wealthByMonth.get(p.month) ?? p.netWorth,
    };
  });
  const active = view.plan.statuses.filter((s) => s.health !== 'achieved' && s.health !== 'paused');

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi title={`Receitas (${formatMonth(cur.month)})`} value={brl.format(cur.totalIncome)} g="receitas" />
        <Kpi title="Despesas" value={brl.format(cur.totalExpenses)} g="despesas" />
        <Kpi title="Saldo livre" value={brl.format(cur.freeBalance)} g="saldo-livre"
          tone={cur.freeBalance >= 0 ? 'good' : 'bad'} />
        <Kpi title="Patrimônio projetado" value={brl.format(curWealth.netWorth)} g="patrimonio" tone="accent" />
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

      <Card title="Saldo livre projetado · próximos 24 meses" g="saldo-livre">
        <div style={{ color: 'var(--ink)' }}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chart} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={axis} interval={1} />
              <YAxis yAxisId="mes" tick={axis} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis yAxisId="acc" orientation="right" tick={axis} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
              <Legend />
              <ReferenceLine yAxisId="mes" y={0} stroke="var(--line)" />
              <Bar yAxisId="mes" dataKey="freeBalance" name="Saldo livre (mês)" radius={[4, 4, 0, 0]}>
                {chart.map((p) => (
                  <Cell key={p.month} fill={p.freeBalance >= 0 ? 'var(--chart-2)' : 'var(--neg)'} />
                ))}
              </Bar>
              <Line yAxisId="acc" type="monotone" dataKey="saldoAcumulado" name="Saldo livre acumulado" stroke="var(--accent-strong)" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Patrimônio projetado" g="patrimonio">
        <div style={{ color: 'var(--ink)' }}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chart} margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={axis} interval={1} />
              <YAxis tick={axis} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="netWorth" name="Patrimônio" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title={`Aportes sugeridos · ${formatMonth(cur.month)}`} g="aporte-minimo">
        {active.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Nenhuma meta ativa.</p>
        ) : (
          <ul>
            {active.map((s) => (
              <li
                key={s.goal.id}
                className="flex items-center gap-3.5 border-b py-3 text-sm last:border-0"
                style={{ borderColor: 'var(--line)' }}
              >
                <HealthChip health={s.health} />
                <span className="font-medium" style={{ color: 'var(--ink)' }}>{s.goal.name}</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>mín. {brl.format(s.requiredMonthly)}/mês</span>
                <span className="num font-display ml-auto font-bold" style={{ color: 'var(--accent-strong)' }}>
                  {brl.format(s.suggestedThisMonth)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
          Como isso é calculado? Veja o{' '}
          <Link className="font-semibold" href="/glossario/">glossário</Link>.
        </p>
      </Card>
    </>
  );
}

function Kpi({ title, value, tone, g }: { title: string; value: string; tone?: 'good' | 'bad' | 'accent'; g?: string }) {
  const color =
    tone === 'good' ? 'var(--pos)'
    : tone === 'bad' ? 'var(--neg)'
    : tone === 'accent' ? 'var(--accent-strong)'
    : 'var(--ink)';
  return (
    <div className="card !p-5">
      <p className="m-0 mb-2.5 text-[12.5px] font-medium" style={{ color: 'var(--muted)' }}>
        {title}{' '}
        {g && <InfoTip g={g} />}
      </p>
      <p className="num font-display m-0 text-[26px] font-bold tracking-tight" style={{ color }}>{value}</p>
    </div>
  );
}

function Card({ title, children, g }: { title: string; children: React.ReactNode; g?: string }) {
  return (
    <section className="card mb-5">
      <h2 className="font-display mb-5 text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>
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
      <Shell>
        <Dashboard />
      </Shell>
    </AuthGate>
  );
}
