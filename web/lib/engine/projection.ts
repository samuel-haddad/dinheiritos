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

    // Parcela conta no mês se month ∈ [start_month, end_month)
    const plannedInstallments = input.plannedExpenses
      .filter((p) => p.active && month >= p.start_month && month < p.end_month)
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

/** Horizonte padrão do app. */
export const DEFAULT_HORIZON = 24;

/** Mês seguinte ao último snapshot conhecido, ou o mês atual. */
export function defaultStartMonth(today: Date = new Date()): Month {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export { addMonths };
