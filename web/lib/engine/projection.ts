// Motor de projeção — função pura, sem I/O (ver docs/PROJECTION_ENGINE.md).
import type {
  CardBill,
  CreditCard,
  Month,
  OneOffIncome,
  PlannedExpense,
  RecurringExpense,
  RecurringIncome,
} from '../types';
import { addMonths, diffMonths, inRange, monthRange, toMonth } from './months';

export interface ProjectionInput {
  startMonth: Month;
  horizon: number; // nº de meses projetados (padrão 24)
  initialNetWorth: number; // contas + investimentos no mês anterior ao start
  recurringIncomes: RecurringIncome[];
  oneOffIncomes: OneOffIncome[];
  recurringExpenses: RecurringExpense[];
  plannedExpenses: PlannedExpense[];
  creditCards: CreditCard[];
  cardBills: CardBill[];
}

export interface MonthProjection {
  month: Month;
  totalIncome: number;
  totalExpenses: number;
  cardExpenses: number;
  plannedInstallments: number;
  freeBalance: number;
  netWorth: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Recorre no mês? Ocorrência a cada `interval` meses a partir de `start`. */
const occurs = (month: Month, start: Month, interval: number | null | undefined): boolean => {
  const step = Math.max(1, Number(interval) || 1);
  return diffMonths(start, month) % step === 0;
};

/**
 * Uma previsão vinculada a cartão (`is_card_expense`) já é fatura real quando `card_bills`
 * tem lançamento para (`credit_card_id`, `month`) — a parcela some naquele mês para não
 * contar em dobro com `cardExpenses`. Ver docs/PROJECTION_ENGINE.md §1.
 */
const suppressedByCardBill = (p: PlannedExpense, month: Month, bills: Map<string, number>): boolean =>
  p.is_card_expense && !!p.credit_card_id && bills.has(`${p.credit_card_id}|${month}`);

export function project(input: ProjectionInput): MonthProjection[] {
  const bills = new Map<string, number>();
  for (const b of input.cardBills) {
    bills.set(`${b.credit_card_id}|${b.month}`, Number(b.amount));
  }

  let netWorth = input.initialNetWorth;
  return monthRange(input.startMonth, input.horizon).map((month) => {
    const recurringIncome = input.recurringIncomes
      .filter((i) => i.active && inRange(month, i.start_month, i.end_month) && occurs(month, i.start_month, i.interval_months))
      .reduce((s, i) => s + Number(i.amount), 0);

    const oneOffIncome = input.oneOffIncomes
      .filter((i) => i.active && toMonth(i.expected_date) === month)
      .reduce((s, i) => s + Number(i.amount), 0);

    const recurringExpense = input.recurringExpenses
      .filter((e) => e.active && inRange(month, e.start_month, e.end_month) && occurs(month, e.start_month, e.interval_months))
      .reduce((s, e) => s + Number(e.amount), 0);

    // Parcela conta no mês se month ∈ [start_month, end_month) — exceto quando vinculada
    // a um cartão cuja fatura do mês já foi lançada (já é fatura real, ver suppressedByCardBill).
    const plannedInstallments = input.plannedExpenses
      .filter((p) => p.active && month >= p.start_month && month < p.end_month)
      .filter((p) => !suppressedByCardBill(p, month, bills))
      .reduce((s, p) => s + Number(p.installment_amount), 0);

    // Fatura real quando existe; senão valor-base do cartão
    const cardExpenses = input.creditCards
      .filter((c) => c.active)
      .reduce((s, c) => {
        const real = bills.get(`${c.id}|${month}`);
        return s + (real !== undefined ? real : Number(c.base_amount));
      }, 0);

    const totalIncome = r2(recurringIncome + oneOffIncome);
    const totalExpenses = r2(recurringExpense + plannedInstallments + cardExpenses);
    const freeBalance = r2(totalIncome - totalExpenses);
    netWorth = r2(netWorth + freeBalance);

    return {
      month,
      totalIncome,
      totalExpenses,
      cardExpenses: r2(cardExpenses),
      plannedInstallments: r2(plannedInstallments),
      freeBalance,
      netWorth,
    };
  });
}

/** Tipo de lançamento no detalhamento mensal. */
export type DetailKind = 'recurring' | 'one_off' | 'planned' | 'card';

/** Um lançamento individual que compõe as receitas/despesas de um mês. */
export interface DetailItem {
  id: string;
  name: string;
  amount: number;
  profileId: string;
  kind: DetailKind;
}

export interface MonthDetail {
  month: Month;
  incomes: DetailItem[]; // recorrentes + pontuais
  expenses: DetailItem[]; // recorrentes + parcelas de previsões + faturas
}

/** Insumos que o detalhamento usa (subconjunto de ProjectionInput, sem horizonte/patrimônio). */
export type MonthDetailInput = Pick<
  ProjectionInput,
  'recurringIncomes' | 'oneOffIncomes' | 'recurringExpenses' | 'plannedExpenses' | 'creditCards' | 'cardBills'
>;

/**
 * Detalha, item a item, os lançamentos previstos de um único mês — usando exatamente
 * as mesmas regras de `project()`. A soma de `incomes`/`expenses` reproduz
 * `totalIncome`/`totalExpenses` daquele mês. Função pura (sem I/O).
 */
export function monthDetail(input: MonthDetailInput, month: Month): MonthDetail {
  const bills = new Map<string, number>();
  for (const b of input.cardBills) {
    bills.set(`${b.credit_card_id}|${b.month}`, Number(b.amount));
  }

  const incomes: DetailItem[] = [];
  const expenses: DetailItem[] = [];

  for (const i of input.recurringIncomes) {
    if (i.active && inRange(month, i.start_month, i.end_month) && occurs(month, i.start_month, i.interval_months)) {
      incomes.push({ id: i.id, name: i.name, amount: r2(Number(i.amount)), profileId: i.profile_id, kind: 'recurring' });
    }
  }
  for (const i of input.oneOffIncomes) {
    if (i.active && toMonth(i.expected_date) === month) {
      incomes.push({ id: i.id, name: i.name, amount: r2(Number(i.amount)), profileId: i.profile_id, kind: 'one_off' });
    }
  }

  for (const e of input.recurringExpenses) {
    if (e.active && inRange(month, e.start_month, e.end_month) && occurs(month, e.start_month, e.interval_months)) {
      expenses.push({ id: e.id, name: e.name, amount: r2(Number(e.amount)), profileId: e.profile_id, kind: 'recurring' });
    }
  }
  for (const p of input.plannedExpenses) {
    if (p.active && month >= p.start_month && month < p.end_month && !suppressedByCardBill(p, month, bills)) {
      expenses.push({ id: p.id, name: p.name, amount: r2(Number(p.installment_amount)), profileId: p.profile_id, kind: 'planned' });
    }
  }
  for (const c of input.creditCards) {
    if (!c.active) continue;
    const real = bills.get(`${c.id}|${month}`);
    const amount = real !== undefined ? real : Number(c.base_amount);
    expenses.push({ id: c.id, name: c.name, amount: r2(amount), profileId: c.profile_id, kind: 'card' });
  }

  return { month, incomes, expenses };
}

/** Horizonte padrão do app. */
export const DEFAULT_HORIZON = 24;

/** Mês seguinte ao último snapshot conhecido, ou o mês atual. */
export function defaultStartMonth(today: Date = new Date()): Month {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export { addMonths };
