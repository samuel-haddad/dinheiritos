import { describe, expect, it } from 'vitest';
import { deriveHistory, firstReconstructibleMonth, netWorthAt } from './history';
import type {
  AccountSnapshot,
  InvestmentSnapshot,
  MonthlyProjection,
  RecurringExpense,
  RecurringIncome,
} from './types';

const acc = (account_id: string, month: string, balance: number): AccountSnapshot => ({
  id: `${account_id}-${month}`, account_id, month, balance,
});
const inv = (investment_id: string, month: string, balance: number): InvestmentSnapshot => ({
  id: `${investment_id}-${month}`, investment_id, month, balance,
});
const inc = (o: Partial<RecurringIncome>): RecurringIncome => ({
  id: o.id ?? 'i', profile_id: 'p', name: o.name ?? 'Salário', amount: o.amount ?? 100,
  receipt_day: 5, start_month: o.start_month ?? '2026-07-01', end_month: o.end_month ?? null,
  active: o.active ?? true, periodicity: 'mensal', interval_months: o.interval_months ?? 1,
});
const exp = (o: Partial<RecurringExpense>): RecurringExpense => ({
  id: o.id ?? 'e', profile_id: 'p', name: o.name ?? 'Aluguel', amount: o.amount ?? 0, payment_day: null,
  start_month: o.start_month ?? '2026-07-01', end_month: o.end_month ?? null,
  active: o.active ?? true, periodicity: 'mensal', interval_months: o.interval_months ?? 1,
});
const proj = (month: string, net_worth: number): MonthlyProjection => ({
  id: month, month, total_income: 0, total_expenses: 0, free_balance: 0,
  goal_allocation: 0, net_worth, is_closed: true,
});

const emptyBase = {
  oneOffIncomes: [], recurringExpenses: [], plannedExpenses: [], creditCards: [], cardBills: [],
  investmentSnapshots: [] as InvestmentSnapshot[], legacy: [] as MonthlyProjection[],
};

describe('netWorthAt', () => {
  const accounts = [acc('A', '2026-07-01', 1000), acc('A', '2026-09-01', 1500)];
  const invs = [inv('I', '2026-08-01', 200)];

  it('pega o último snapshot com month ≤ alvo', () => {
    expect(netWorthAt(accounts, [], '2026-08-01')).toBe(1000);
    expect(netWorthAt(accounts, [], '2026-09-01')).toBe(1500);
    expect(netWorthAt(accounts, [], '2026-10-01')).toBe(1500);
  });

  it('meses antes do primeiro snapshot da conta somam 0', () => {
    expect(netWorthAt(accounts, [], '2026-06-01')).toBe(0);
  });

  it('soma contas + investimentos', () => {
    expect(netWorthAt(accounts, invs, '2026-08-01')).toBe(1200);
  });
});

describe('firstReconstructibleMonth', () => {
  it('retorna o menor start_month entre recorrentes', () => {
    const r = firstReconstructibleMonth(
      [inc({ start_month: '2026-07-01' })],
      [exp({ start_month: '2026-05-01' })],
    );
    expect(r).toBe('2026-05-01');
  });

  it('null sem recorrentes', () => {
    expect(firstReconstructibleMonth([], [])).toBeNull();
  });
});

describe('deriveHistory', () => {
  it('deriva meses [primeira recorrente, mês atual) do motor + snapshots', () => {
    const rows = deriveHistory({
      ...emptyBase,
      startMonth: '2026-10-01',
      recurringIncomes: [inc({ amount: 100, start_month: '2026-07-01' })],
      accountSnapshots: [acc('A', '2026-07-01', 1000), acc('A', '2026-09-01', 1500)],
    });
    expect(rows.map((r) => r.month)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
    for (const r of rows) {
      expect(r.receitas).toBe(100);
      expect(r.despesas).toBe(0);
      expect(r.saldo).toBe(100);
      expect(r.aportes).toBe(0);
      expect(r.real).toBe(true);
    }
    expect(rows.find((r) => r.month === '2026-07-01')!.patrimonio).toBe(1000);
    expect(rows.find((r) => r.month === '2026-08-01')!.patrimonio).toBe(1000);
    expect(rows.find((r) => r.month === '2026-09-01')!.patrimonio).toBe(1500);
  });

  it('usa monthly_projections só como semente legada (< primeira recorrente)', () => {
    const rows = deriveHistory({
      ...emptyBase,
      startMonth: '2026-08-01',
      recurringIncomes: [inc({ amount: 100, start_month: '2026-07-01' })],
      accountSnapshots: [acc('A', '2026-07-01', 1000)],
      legacy: [proj('2026-06-01', 900), proj('2026-07-01', 9999)], // 07 é reconstruível → ignorada
    });
    expect(rows.map((r) => r.month)).toEqual(['2026-06-01', '2026-07-01']);
    const jun = rows.find((r) => r.month === '2026-06-01')!;
    expect(jun.patrimonio).toBe(900); // semente legada
    const jul = rows.find((r) => r.month === '2026-07-01')!;
    expect(jul.patrimonio).toBe(1000); // derivado dos snapshots, não os 9999 da linha legada
  });

  it('sem recorrentes, cai só na semente legada', () => {
    const rows = deriveHistory({
      ...emptyBase,
      startMonth: '2026-08-01',
      recurringIncomes: [],
      accountSnapshots: [],
      legacy: [proj('2026-06-01', 900)],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].patrimonio).toBe(900);
  });
});
