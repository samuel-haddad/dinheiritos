import { describe, expect, it } from 'vitest';
import { monthDetail, project } from './projection';
import { addMonths, diffMonths, formatMonth, inRange, monthRange, toMonth } from './months';
import type { CreditCard, PlannedExpense, RecurringExpense, RecurringIncome } from '../types';

const ri = (o: Partial<RecurringIncome>): RecurringIncome => ({
  id: 'i1', profile_id: 'p', name: 'r', amount: 1000, receipt_day: 1,
  start_month: '2026-01-01', end_month: null, active: true,
  periodicity: 'mensal', interval_months: 1, ...o,
});
const re = (o: Partial<RecurringExpense>): RecurringExpense => ({
  id: 'e1', profile_id: 'p', name: 'd', amount: 400, payment_day: null,
  start_month: '2026-01-01', end_month: null, active: true,
  periodicity: 'mensal', interval_months: 1, ...o,
});
const card = (o: Partial<CreditCard>): CreditCard => ({
  id: 'c1', profile_id: 'p', name: 'card', due_day: 10, base_amount: 500,
  logo_url: null, active: true, ...o,
});
const planned = (o: Partial<PlannedExpense>): PlannedExpense => ({
  id: 'pl1', profile_id: 'p', name: 'parc', total_amount: 300, installments: 3,
  installment_amount: 100, start_month: '2026-08-01', end_month: '2026-11-01',
  confirmed: false, active: true, is_card_expense: false, credit_card_id: null, due_day: null, ...o,
});

const base = {
  startMonth: '2026-07-01',
  horizon: 6,
  initialNetWorth: 10000,
  recurringIncomes: [],
  oneOffIncomes: [],
  recurringExpenses: [],
  plannedExpenses: [],
  creditCards: [],
  cardBills: [],
};

describe('months', () => {
  it('soma e vira o ano', () => {
    expect(addMonths('2026-11-01', 2)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });
  it('diferença em meses', () => {
    expect(diffMonths('2026-07-01', '2026-12-01')).toBe(5);
  });
  it('range e formatação', () => {
    expect(monthRange('2026-07-01', 3)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
    expect(formatMonth('2026-07-01')).toBe('jul/26');
    expect(toMonth('2026-07-16')).toBe('2026-07-01');
    expect(inRange('2026-07-01', '2026-01-01', null)).toBe(true);
    expect(inRange('2026-07-01', '2026-01-01', '2026-06-01')).toBe(false);
  });
});

describe('project', () => {
  it('receita recorrente respeita vigência', () => {
    const out = project({
      ...base,
      recurringIncomes: [ri({ amount: 1000, end_month: '2026-08-01' })],
    });
    expect(out[0].totalIncome).toBe(1000); // jul
    expect(out[1].totalIncome).toBe(1000); // ago
    expect(out[2].totalIncome).toBe(0); // set (encerrada)
  });

  it('receita anual recorre só a cada 12 meses a partir do início', () => {
    const out = project({
      ...base,
      startMonth: '2026-01-01',
      horizon: 24,
      recurringIncomes: [ri({ amount: 1000, start_month: '2026-01-01', periodicity: 'anual', interval_months: 12 })],
    });
    expect(out[0].totalIncome).toBe(1000); // jan/26
    expect(out[1].totalIncome).toBe(0); // fev/26
    expect(out[11].totalIncome).toBe(0); // dez/26
    expect(out[12].totalIncome).toBe(1000); // jan/27
  });

  it('despesa customizada recorre a cada N meses', () => {
    const out = project({
      ...base,
      startMonth: '2026-01-01',
      horizon: 6,
      recurringExpenses: [re({ amount: 300, start_month: '2026-01-01', periodicity: 'custom', interval_months: 3 })],
    });
    expect(out[0].totalExpenses).toBe(300); // jan
    expect(out[1].totalExpenses).toBe(0); // fev
    expect(out[2].totalExpenses).toBe(0); // mar
    expect(out[3].totalExpenses).toBe(300); // abr
  });

  it('receita pontual entra só no mês', () => {
    const out = project({
      ...base,
      oneOffIncomes: [{ id: 'o', profile_id: 'p', name: '13o', amount: 5000, expected_date: '2026-09-15', confirmed: false, active: true }],
    });
    expect(out[2].totalIncome).toBe(5000);
    expect(out[0].totalIncome).toBe(0);
  });

  it('receita pontual inativa não entra na projeção', () => {
    const out = project({
      ...base,
      oneOffIncomes: [{ id: 'o', profile_id: 'p', name: '13o', amount: 5000, expected_date: '2026-09-15', confirmed: false, active: false }],
    });
    expect(out[2].totalIncome).toBe(0);
  });

  it('fatura real substitui valor-base do cartão', () => {
    const out = project({
      ...base,
      creditCards: [card({ base_amount: 500 })],
      cardBills: [{ id: 'b', credit_card_id: 'c1', month: '2026-07-01', amount: 800 }],
    });
    expect(out[0].cardExpenses).toBe(800); // fatura real
    expect(out[1].cardExpenses).toBe(500); // valor-base
  });

  it('parcelas contam em [início, fim)', () => {
    const out = project({ ...base, plannedExpenses: [planned({})] });
    expect(out[0].plannedInstallments).toBe(0); // jul
    expect(out[1].plannedInstallments).toBe(100); // ago
    expect(out[3].plannedInstallments).toBe(100); // out
    expect(out[4].plannedInstallments).toBe(0); // nov (fim exclusivo)
  });

  it('previsão vinculada a cartão soma normalmente quando a fatura do mês não existe', () => {
    const out = project({
      ...base,
      plannedExpenses: [planned({ is_card_expense: true, credit_card_id: 'c1' })],
    });
    expect(out[1].plannedInstallments).toBe(100); // ago — sem fatura lançada
    expect(out[1].totalExpenses).toBe(100);
  });

  it('previsão vinculada a cartão some no mês em que a fatura já foi lançada', () => {
    const out = project({
      ...base,
      creditCards: [card({ id: 'c1', base_amount: 0 })],
      cardBills: [{ id: 'b', credit_card_id: 'c1', month: '2026-08-01', amount: 900 }],
      plannedExpenses: [planned({ is_card_expense: true, credit_card_id: 'c1' })],
    });
    // ago: fatura já lançada — a parcela não soma, só a fatura real conta
    expect(out[1].plannedInstallments).toBe(0);
    expect(out[1].cardExpenses).toBe(900);
    expect(out[1].totalExpenses).toBe(900);
    // set: sem fatura ainda — a parcela volta a somar normalmente
    expect(out[2].plannedInstallments).toBe(100);
    expect(out[2].cardExpenses).toBe(0);
  });

  it('patrimônio acumula saldo livre', () => {
    const out = project({
      ...base,
      horizon: 3,
      recurringIncomes: [ri({ amount: 1000 })],
      recurringExpenses: [re({ amount: 400 })],
    });
    expect(out[0].freeBalance).toBe(600);
    expect(out[0].netWorth).toBe(10600);
    expect(out[2].netWorth).toBe(11800);
  });

  it('despesa inativa não conta', () => {
    const out = project({ ...base, recurringExpenses: [re({ active: false })] });
    expect(out[0].totalExpenses).toBe(0);
  });
});

describe('monthDetail', () => {
  const input = {
    ...base,
    recurringIncomes: [ri({ id: 'i1', name: 'Salário', amount: 1000 })],
    oneOffIncomes: [
      { id: 'o1', profile_id: 'p', name: '13º', amount: 500, expected_date: '2026-07-20', confirmed: false, active: true },
    ],
    recurringExpenses: [re({ id: 'e1', name: 'Condomínio', amount: 400 })],
    plannedExpenses: [planned({ id: 'pl1', name: 'Obra', installment_amount: 100, start_month: '2026-07-01', end_month: '2026-10-01' })],
    creditCards: [card({ id: 'c1', name: 'Santander', base_amount: 500 })],
    cardBills: [{ id: 'b1', credit_card_id: 'c1', month: '2026-07-01', amount: 620 }],
  };

  it('lista cada lançamento e a soma bate com project()', () => {
    const d = monthDetail(input, '2026-07-01');
    expect(d.incomes.map((i) => i.name).sort()).toEqual(['13º', 'Salário']);
    expect(d.expenses.map((e) => e.kind).sort()).toEqual(['card', 'planned', 'recurring']);
    // fatura real (620) substitui o base_amount
    expect(d.expenses.find((e) => e.kind === 'card')!.amount).toBe(620);

    const agg = project({ ...input, horizon: 1 })[0];
    const incomeSum = d.incomes.reduce((s, i) => s + i.amount, 0);
    const expenseSum = d.expenses.reduce((s, e) => s + e.amount, 0);
    expect(Math.round(incomeSum * 100) / 100).toBe(agg.totalIncome);
    expect(Math.round(expenseSum * 100) / 100).toBe(agg.totalExpenses);
  });

  it('usa base_amount quando não há fatura', () => {
    const d = monthDetail(input, '2026-08-01');
    expect(d.expenses.find((e) => e.kind === 'card')!.amount).toBe(500);
    expect(d.incomes.map((i) => i.name)).toEqual(['Salário']); // pontual só em julho
  });

  it('previsão vinculada a cartão não aparece no mês em que a fatura já foi lançada', () => {
    const withCardPlanned = {
      ...input,
      plannedExpenses: [
        planned({ id: 'pl1', name: 'Obra', installment_amount: 100, start_month: '2026-07-01', end_month: '2026-10-01', is_card_expense: true, credit_card_id: 'c1' }),
      ],
    };
    const d = monthDetail(withCardPlanned, '2026-07-01'); // julho já tem fatura em `input.cardBills`
    expect(d.expenses.map((e) => e.kind).sort()).toEqual(['card', 'recurring']);
    const d2 = monthDetail(withCardPlanned, '2026-08-01'); // agosto sem fatura lançada
    expect(d2.expenses.map((e) => e.kind).sort()).toEqual(['card', 'planned', 'recurring']);
  });
});
