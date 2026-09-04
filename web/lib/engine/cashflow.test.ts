import { describe, expect, it } from 'vitest';
import { dailyCashFlow } from './cashflow';
import type { CreditCard, PlannedExpense, RecurringExpense, RecurringIncome } from '../types';

const ri = (o: Partial<RecurringIncome>): RecurringIncome => ({
  id: 'i1', profile_id: 'p', name: 'r', amount: 1000, receipt_day: 5,
  start_month: '2026-07-01', end_month: null, active: true,
  periodicity: 'mensal', interval_months: 1, ...o,
});
const re = (o: Partial<RecurringExpense>): RecurringExpense => ({
  id: 'e1', profile_id: 'p', name: 'd', amount: 400, payment_day: 10,
  start_month: '2026-07-01', end_month: null, active: true,
  periodicity: 'mensal', interval_months: 1, ...o,
});
const card = (o: Partial<CreditCard>): CreditCard => ({
  id: 'c1', profile_id: 'p', name: 'card', due_day: 15, base_amount: 500,
  logo_url: null, active: true, ...o,
});
const planned = (o: Partial<PlannedExpense>): PlannedExpense => ({
  id: 'pl1', profile_id: 'p', name: 'parc', total_amount: 300, installments: 3,
  installment_amount: 100, start_month: '2026-08-01', end_month: '2026-11-01',
  confirmed: false, active: true, is_card_expense: false, credit_card_id: null,
  due_day: 20, goal_id: null, ...o,
});

const base = {
  month: '2026-07-01',
  startBalance: 0,
  recurringIncomes: [],
  oneOffIncomes: [],
  recurringExpenses: [],
  plannedExpenses: [],
  creditCards: [],
  cardBills: [],
};

describe('dailyCashFlow', () => {
  it('distribui receitas e despesas nos dias corretos e acumula o saldo', () => {
    const out = dailyCashFlow({
      ...base,
      startBalance: 100,
      recurringIncomes: [ri({ amount: 1000, receipt_day: 5 })],
      recurringExpenses: [re({ amount: 400, payment_day: 10 })],
    });
    expect(out.days).toHaveLength(31); // julho tem 31 dias
    expect(out.days[3].balance).toBe(100); // dia 4, nada ainda
    expect(out.days[4].balance).toBe(1100); // dia 5, entra a receita
    expect(out.days[9].balance).toBe(700); // dia 10, sai a despesa
    expect(out.days[9].date).toBe('2026-07-10');
    expect(out.withdrawalNeeded).toBe(false);
  });

  it('sinaliza necessidade de retirada quando o saldo fica negativo', () => {
    const out = dailyCashFlow({
      ...base,
      startBalance: 200,
      recurringExpenses: [re({ amount: 500, payment_day: 10 })],
      recurringIncomes: [ri({ amount: 1000, receipt_day: 25 })], // só entra depois do aperto
    });
    expect(out.withdrawalNeeded).toBe(true);
    expect(out.withdrawalAmount).toBe(300); // 200 - 500 = -300
    expect(out.withdrawalDate).toBe('2026-07-10');
    expect(out.minBalance).toBe(-300);
    expect(out.minBalanceDate).toBe('2026-07-10');
    // depois da receita do dia 25, o saldo volta a ficar positivo, mas o alerta já disparou
    expect(out.days[24].balance).toBe(700);
  });

  it('sem dia informado, assume dia 1 do mês', () => {
    const out = dailyCashFlow({
      ...base,
      recurringIncomes: [ri({ amount: 1000, receipt_day: null })],
    });
    expect(out.days[0].income).toBe(1000);
    expect(out.days[0].balance).toBe(1000);
  });

  it('dia inexistente no mês (ex.: 31 em mês de 30 dias) cai no último dia', () => {
    const out = dailyCashFlow({
      ...base,
      month: '2026-09-01', // setembro tem 30 dias
      recurringExpenses: [re({ amount: 100, payment_day: 31 })],
    });
    expect(out.days).toHaveLength(30);
    expect(out.days[29].expenses).toBe(100);
  });

  it('receita recorrente todo dia 30, em fevereiro cai no último dia do mês (28 ou 29)', () => {
    // cenário do pedido: "recebimento de investimento todo dia 30" caindo num fevereiro
    const out = dailyCashFlow({
      ...base,
      month: '2026-02-01', // 2026 não é bissexto → 28 dias
      recurringIncomes: [ri({ amount: 300, receipt_day: 30, start_month: '2026-01-01' })],
    });
    expect(out.days).toHaveLength(28);
    expect(out.days[27].income).toBe(300);

    const leap = dailyCashFlow({
      ...base,
      month: '2028-02-01', // 2028 é bissexto → 29 dias
      recurringIncomes: [ri({ amount: 300, receipt_day: 30, start_month: '2026-07-01' })],
    });
    expect(leap.days).toHaveLength(29);
    expect(leap.days[28].income).toBe(300);
  });

  it('parcela de previsão soma no due_day; suprimida quando a fatura do cartão já foi lançada', () => {
    const noBill = dailyCashFlow({
      ...base,
      month: '2026-08-01',
      plannedExpenses: [planned({ due_day: 20, is_card_expense: true, credit_card_id: 'c1' })],
      creditCards: [card({ id: 'c1', due_day: 15, base_amount: 0 })],
    });
    expect(noBill.days[19].expenses).toBe(100); // sem fatura lançada, a parcela soma

    const withBill = dailyCashFlow({
      ...base,
      month: '2026-08-01',
      plannedExpenses: [planned({ due_day: 20, is_card_expense: true, credit_card_id: 'c1' })],
      creditCards: [card({ id: 'c1', due_day: 15, base_amount: 0 })],
      cardBills: [{ id: 'b', credit_card_id: 'c1', month: '2026-08-01', amount: 900 }],
    });
    expect(withBill.days[19].expenses).toBe(0); // suprimida — já está na fatura
    expect(withBill.days[14].expenses).toBe(900); // fatura real no dia do vencimento do cartão
  });

  it('fatura real substitui valor-base no dia de vencimento do cartão', () => {
    const out = dailyCashFlow({
      ...base,
      creditCards: [card({ due_day: 15, base_amount: 500 })],
      cardBills: [{ id: 'b', credit_card_id: 'c1', month: '2026-07-01', amount: 800 }],
    });
    expect(out.days[14].expenses).toBe(800);
  });
});
