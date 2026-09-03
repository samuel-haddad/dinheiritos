'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import AuthGate from '@/components/AuthGate';
import HealthChip from '@/components/HealthChip';
import InfoTip from '@/components/InfoTip';
import Shell from '@/components/Shell';
import { AppData, currentAccountsBalance, currentNetWorth, loadAppData } from '@/lib/data';
import { brl } from '@/lib/format';
import { goalPositionsAt, planGoals, projectedWealth, requiredHorizon } from '@/lib/engine/allocation';
import { CashFlowResult, dailyCashFlow } from '@/lib/engine/cashflow';
import { formatMonth, monthRange } from '@/lib/engine/months';
import {
  DEFAULT_HORIZON,
  DetailItem,
  DetailKind,
  defaultStartMonth,
  monthDetail,
  project,
} from '@/lib/engine/projection';
import { profileName, useProfiles } from '@/lib/useProfiles';
import type { Profile } from '@/lib/types';

const tooltipStyle = {
  background: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 10,
  color: 'var(--tooltip-text)',
  fontSize: 12.5,
};
const axis = { fontSize: 11, fill: 'var(--muted)' } as const;
const kfmt = (v: number) => `${Math.round(v / 1000)}k`;

/** 'YYYY-MM-DD' → 'DD/MM'. */
function formatDay(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

const KIND_LABEL: Record<DetailKind, string> = {
  recurring: 'recorrente',
  one_off: 'pontual',
  planned: 'previsão',
  card: 'fatura',
};

function KindBadge({ kind }: { kind: DetailKind }) {
  return (
    <span className="badge" style={{ color: 'var(--muted)', background: 'var(--surface-2)' }}>
      {KIND_LABEL[kind]}
    </span>
  );
}

function Kpi({ title, value, g, tone }: { title: string; value: string; g?: string; tone?: 'good' | 'bad' | 'accent' }) {
  const color =
    tone === 'good' ? 'var(--pos)' : tone === 'bad' ? 'var(--neg)' : tone === 'accent' ? 'var(--accent-strong)' : 'var(--ink)';
  return (
    <div className="card min-w-0 !p-4 md:!p-5">
      <p className="m-0 mb-2 truncate text-[12px] font-medium md:mb-2.5 md:text-[12.5px]" style={{ color: 'var(--muted)' }}>
        {title} {g && <InfoTip g={g} />}
      </p>
      <p
        className="num font-display m-0 whitespace-nowrap font-bold tracking-tight"
        style={{ color, fontSize: 'clamp(15px, 4.4vw, 26px)' }}
      >
        {value}
      </p>
    </div>
  );
}

function ItemsTable({
  title,
  g,
  items,
  total,
  profiles,
  empty,
}: {
  title: string;
  g?: string;
  items: DetailItem[];
  total: number;
  profiles: Profile[];
  empty: string;
}) {
  return (
    <section className="card">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display m-0 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
          {title} {g && <InfoTip g={g} className="font-normal" />}
        </h2>
        <span className="num font-display font-bold" style={{ color: 'var(--ink)' }}>
          {brl.format(total)}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
          {empty}
        </p>
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {items.map((it) => (
                <tr key={`${it.kind}-${it.id}`} className="border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium" style={{ color: 'var(--ink)' }}>
                        {it.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <KindBadge kind={it.kind} />
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
                          {profileName(profiles, it.profileId)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="num whitespace-nowrap px-2 py-2.5 text-right align-top font-medium" style={{ color: 'var(--ink)' }}>
                    {brl.format(it.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Alerta + gráfico do saldo em contas dia a dia — sinaliza se e quando faltará caixa. */
function CashFlowSection({ cashFlow }: { cashFlow: CashFlowResult }) {
  const tone = cashFlow.withdrawalNeeded ? 'var(--neg)' : 'var(--pos)';
  const minDay = cashFlow.days.find((d) => d.date === cashFlow.minBalanceDate)?.day;
  const chartData = cashFlow.days.map((d) => ({ dia: d.day, Saldo: d.balance }));
  const tickInterval = Math.max(0, Math.ceil(cashFlow.days.length / 10) - 1);

  return (
    <section className="card mb-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display m-0 text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>
          Fluxo de caixa do mês <InfoTip g="fluxo-caixa-diario" className="font-normal" />
        </h2>
      </div>

      <div
        className="mb-4 rounded-2xl border px-4 py-3 text-sm font-medium"
        style={{
          borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`,
          background: `color-mix(in srgb, ${tone} 10%, transparent)`,
          color: tone,
        }}
      >
        {cashFlow.withdrawalNeeded ? (
          <>
            ⚠️ Será necessário retirar <strong>{brl.format(cashFlow.withdrawalAmount)}</strong> de investimentos —
            o saldo em contas fica negativo em <strong>{formatDay(cashFlow.withdrawalDate!)}</strong>, chegando a{' '}
            {brl.format(cashFlow.minBalance)} em {formatDay(cashFlow.minBalanceDate!)}.
          </>
        ) : (
          <>
            ✅ Sem necessidade de retirada de investimentos neste mês — saldo mínimo projetado em contas de{' '}
            <strong>{brl.format(cashFlow.minBalance)}</strong>
            {cashFlow.minBalanceDate ? ` em ${formatDay(cashFlow.minBalanceDate)}` : ''}.
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ left: 12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
          <XAxis dataKey="dia" tick={axis} interval={tickInterval} tickFormatter={(d) => String(d)} />
          <YAxis tick={axis} tickFormatter={kfmt} />
          <Tooltip
            formatter={(v: any) => brl.format(Number(v))}
            labelFormatter={(d) => `Dia ${d}`}
            contentStyle={tooltipStyle}
          />
          <ReferenceLine y={0} stroke="var(--line)" />
          <Area dataKey="Saldo" stroke={tone} fill={tone} fillOpacity={0.15} strokeWidth={2} dot={false} />
          {cashFlow.withdrawalNeeded && minDay !== undefined && (
            <ReferenceDot x={minDay} y={cashFlow.minBalance} r={5} fill="var(--neg)" stroke="none" />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}

function Resumo() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(defaultStartMonth());
  const profiles = useProfiles();

  useEffect(() => {
    loadAppData().then(setData).catch((e) => setError(String(e)));
  }, []);

  const startMonth = defaultStartMonth();
  const months = useMemo(() => monthRange(startMonth, DEFAULT_HORIZON + 1), [startMonth]);

  const view = useMemo(() => {
    if (!data) return null;
    const netWorth = currentNetWorth(data);
    const engineInput = {
      startMonth,
      initialNetWorth: netWorth,
      recurringIncomes: data.recurringIncomes,
      oneOffIncomes: data.oneOffIncomes,
      recurringExpenses: data.recurringExpenses,
      plannedExpenses: data.plannedExpenses,
      creditCards: data.creditCards,
      cardBills: data.cardBills,
    };
    const proj = project({ ...engineInput, horizon: DEFAULT_HORIZON + 1 });
    const long = project({ ...engineInput, horizon: requiredHorizon(data.goals, startMonth) });
    const plan = planGoals(
      data.goals,
      netWorth,
      long.map((p) => ({ month: p.month, freeBalance: p.freeBalance })),
      startMonth,
      data.allocationMode
    );
    const wealth = projectedWealth(
      proj.map((p) => ({ month: p.month, netWorth: p.netWorth })),
      data.goals,
      plan
    );

    const detail = monthDetail(engineInput, month);
    const monthProj = proj.find((p) => p.month === month) ?? null;
    const monthWealth = wealth.find((w) => w.month === month) ?? null;
    const monthAlloc = plan.monthly.find((m) => m.month === month);
    const allocByGoal = new Map((monthAlloc?.perGoal ?? []).map((pg) => [pg.goalId, pg.amount]));
    const positions = goalPositionsAt(data.goals, netWorth, plan.monthly, month, data.allocationMode);
    const statusByGoal = new Map(plan.statuses.map((s) => [s.goal.id, s]));

    const goalRows = data.goals
      .slice()
      .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.priority - b.priority)
      .map((g) => {
        const position = positions.get(g.id) ?? 0;
        const target = Number(g.target_amount);
        return {
          id: g.id,
          name: g.name,
          target,
          position,
          remaining: Math.max(0, Math.round((target - position) * 100) / 100),
          contribution: allocByGoal.get(g.id) ?? 0,
          health: statusByGoal.get(g.id)?.health ?? 'paused',
          deadline: g.deadline,
        };
      });
    const totalContribution = goalRows.reduce((s, r) => s + r.contribution, 0);

    const incomeTotal = detail.incomes.reduce((s, i) => s + i.amount, 0);
    const expenseTotal = detail.expenses.reduce((s, e) => s + e.amount, 0);

    // Fluxo de caixa diário (docs/PROJECTION_ENGINE.md §5): parte do saldo real em contas
    // (sem investimentos) e acumula o saldo livre projetado dos meses até o anterior ao
    // selecionado — aproximação de quanto estará em contas no início daquele mês.
    const priorFreeBalance = proj
      .filter((p) => p.month < month)
      .reduce((s, p) => s + p.freeBalance, 0);
    const cashFlowStart = Math.round((currentAccountsBalance(data) + priorFreeBalance) * 100) / 100;
    const cashFlow = dailyCashFlow({
      month,
      startBalance: cashFlowStart,
      recurringIncomes: data.recurringIncomes,
      oneOffIncomes: data.oneOffIncomes,
      recurringExpenses: data.recurringExpenses,
      plannedExpenses: data.plannedExpenses,
      creditCards: data.creditCards,
      cardBills: data.cardBills,
    });

    return {
      detail,
      incomeTotal: Math.round(incomeTotal * 100) / 100,
      expenseTotal: Math.round(expenseTotal * 100) / 100,
      monthProj,
      monthWealth,
      goalRows,
      totalContribution: Math.round(totalContribution * 100) / 100,
      cashFlow,
    };
  }, [data, month, startMonth]);

  if (error) return <p style={{ color: 'var(--neg)' }}>Erro ao carregar dados: {error}</p>;
  if (!view || !data) return <p style={{ color: 'var(--muted)' }}>Carregando resumo…</p>;

  const idx = months.indexOf(month);
  const go = (delta: number) => {
    const ni = idx + delta;
    if (ni >= 0 && ni < months.length) setMonth(months[ni]);
  };
  const income = view.monthProj?.totalIncome ?? view.incomeTotal;
  const expense = view.monthProj?.totalExpenses ?? view.expenseTotal;
  const free = view.monthProj?.freeBalance ?? income - expense;
  const wealth = view.monthWealth?.netWorth ?? 0;

  return (
    <>
      {/* Seletor de mês */}
      <div className="mb-6 flex items-center gap-2">
        <button
          onClick={() => go(-1)}
          disabled={idx <= 0}
          className="btn-secondary !px-3 disabled:opacity-40"
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}
        >
          {months.map((m, i) => (
            <option key={m} value={m}>
              {formatMonth(m)}
              {i === 0 ? ' · atual' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={() => go(1)}
          disabled={idx >= months.length - 1}
          className="btn-secondary !px-3 disabled:opacity-40"
          aria-label="Próximo mês"
        >
          ›
        </button>
        <span className="ml-1 text-xs" style={{ color: 'var(--muted)' }}>
          {idx === 0 ? 'mês atual' : `+${idx} ${idx === 1 ? 'mês' : 'meses'} · projeção`}
        </span>
      </div>

      {/* Consolidados */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi title="Receitas totais" value={brl.format(income)} g="receitas" />
        <Kpi title="Despesas totais" value={brl.format(expense)} g="despesas" />
        <Kpi title="Saldo livre" value={brl.format(free)} g="saldo-livre" tone={free >= 0 ? 'good' : 'bad'} />
        <Kpi title="Patrimônio projetado" value={brl.format(wealth)} g="patrimonio" tone="accent" />
      </div>

      {/* Fluxo de caixa diário */}
      <CashFlowSection cashFlow={view.cashFlow} />

      {/* Lançamentos previstos */}
      <div className="mb-6 grid gap-5 md:grid-cols-2">
        <ItemsTable
          title="Receitas"
          g="receitas"
          items={view.detail.incomes}
          total={view.incomeTotal}
          profiles={profiles}
          empty="Nenhuma receita prevista neste mês."
        />
        <ItemsTable
          title="Despesas"
          g="despesas"
          items={view.detail.expenses}
          total={view.expenseTotal}
          profiles={profiles}
          empty="Nenhuma despesa prevista neste mês."
        />
      </div>

      {/* Metas: posição + aporte + status */}
      <section className="card">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display m-0 text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>
            Metas <InfoTip g={['status-meta', 'alocacao']} className="font-normal" />
          </h2>
          <span className="text-sm" style={{ color: 'var(--muted)' }}>
            Aportes do mês:{' '}
            <span className="num font-display font-bold" style={{ color: 'var(--accent-strong)' }}>
              {brl.format(view.totalContribution)}
            </span>
          </span>
        </div>
        {view.goalRows.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Nenhuma meta cadastrada.
          </p>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr
                  className="border-b text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
                >
                  <th className="px-4 py-3">Meta</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Posição projetada</th>
                  <th className="px-4 py-3 text-right">Aporte do mês</th>
                  <th className="px-4 py-3 text-right">Faltante</th>
                </tr>
              </thead>
              <tbody>
                {view.goalRows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium" style={{ color: 'var(--ink)' }}>
                          {r.name}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
                          alvo {brl.format(r.target)} · prazo {formatMonth(r.deadline)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <HealthChip health={r.health} />
                    </td>
                    <td className="num px-4 py-2.5 text-right" style={{ color: 'var(--ink)' }}>
                      {brl.format(r.position)}
                    </td>
                    <td className="num px-4 py-2.5 text-right" style={{ color: r.contribution > 0 ? 'var(--accent-strong)' : 'var(--muted)' }}>
                      {r.contribution > 0 ? brl.format(r.contribution) : '—'}
                    </td>
                    <td className="num px-4 py-2.5 text-right" style={{ color: 'var(--muted)' }}>
                      {brl.format(r.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Shell>
        <Resumo />
      </Shell>
    </AuthGate>
  );
}
