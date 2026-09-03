// Fluxo de caixa diário — função pura, sem I/O (ver docs/PROJECTION_ENGINE.md §5).
// Distribui os lançamentos de um mês pelo dia em que efetivamente ocorrem e acumula o
// saldo em contas dia a dia, sinalizando o momento em que ele fica negativo — ou seja,
// em que seria necessário sacar de investimentos para cobrir as despesas do mês.
import type {
  CardBill,
  CreditCard,
  Month,
  OneOffIncome,
  PlannedExpense,
  RecurringExpense,
  RecurringIncome,
} from '../types';
import { daysInMonth, inRange, toMonth } from './months';
import { occurs, suppressedByCardBill } from './projection';

export interface DailyCashFlowInput {
  month: Month;
  /** Saldo em contas correntes no início do mês (não inclui investimentos). */
  startBalance: number;
  recurringIncomes: RecurringIncome[];
  oneOffIncomes: OneOffIncome[];
  recurringExpenses: RecurringExpense[];
  plannedExpenses: PlannedExpense[];
  creditCards: CreditCard[];
  cardBills: CardBill[];
}

export interface CashFlowDay {
  day: number;
  date: string; // 'YYYY-MM-DD'
  income: number;
  expenses: number;
  /** Saldo em contas acumulado ao final do dia. */
  balance: number;
}

export interface CashFlowResult {
  month: Month;
  startBalance: number;
  days: CashFlowDay[];
  minBalance: number;
  minBalanceDate: string | null;
  /** true se o saldo em contas fica negativo em algum dia do mês. */
  withdrawalNeeded: boolean;
  /** Quanto seria preciso sacar de investimentos para cobrir o pior momento do mês. */
  withdrawalAmount: number;
  /** Primeiro dia em que o saldo fica negativo. */
  withdrawalDate: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Dia do mês válido (1-31); sem valor lançado, assume o dia 1 (mesma leitura do mês inteiro). */
const dayOf = (d: number | null | undefined): number => {
  const n = Number(d);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : 1;
};

/** Dias que não existem no mês (ex.: 31 em abril) caem no último dia do mês. */
const clampDay = (day: number, total: number) => Math.min(day, total);

export function dailyCashFlow(input: DailyCashFlowInput): CashFlowResult {
  const total = daysInMonth(input.month);
  const incomeByDay = new Array<number>(total + 1).fill(0);
  const expenseByDay = new Array<number>(total + 1).fill(0);

  const bills = new Map<string, number>();
  for (const b of input.cardBills) bills.set(`${b.credit_card_id}|${b.month}`, Number(b.amount));

  for (const i of input.recurringIncomes) {
    if (i.active && inRange(input.month, i.start_month, i.end_month) && occurs(input.month, i.start_month, i.interval_months)) {
      incomeByDay[clampDay(dayOf(i.receipt_day), total)] += Number(i.amount);
    }
  }
  for (const i of input.oneOffIncomes) {
    if (i.active && toMonth(i.expected_date) === input.month) {
      const day = clampDay(dayOf(Number(i.expected_date.slice(8, 10))), total);
      incomeByDay[day] += Number(i.amount);
    }
  }
  for (const e of input.recurringExpenses) {
    if (e.active && inRange(input.month, e.start_month, e.end_month) && occurs(input.month, e.start_month, e.interval_months)) {
      expenseByDay[clampDay(dayOf(e.payment_day), total)] += Number(e.amount);
    }
  }
  for (const p of input.plannedExpenses) {
    if (p.active && input.month >= p.start_month && input.month < p.end_month && !suppressedByCardBill(p, input.month, bills)) {
      expenseByDay[clampDay(dayOf(p.due_day), total)] += Number(p.installment_amount);
    }
  }
  for (const c of input.creditCards) {
    if (!c.active) continue;
    const real = bills.get(`${c.id}|${input.month}`);
    const amount = real !== undefined ? real : Number(c.base_amount);
    expenseByDay[clampDay(dayOf(c.due_day), total)] += amount;
  }

  const days: CashFlowDay[] = [];
  let balance = r2(input.startBalance);
  let minBalance = balance;
  let minBalanceDate: string | null = null;
  let withdrawalDate: string | null = null;

  for (let d = 1; d <= total; d++) {
    const income = r2(incomeByDay[d]);
    const expenses = r2(expenseByDay[d]);
    balance = r2(balance + income - expenses);
    const date = `${input.month.slice(0, 7)}-${String(d).padStart(2, '0')}`;
    if (balance < minBalance) {
      minBalance = balance;
      minBalanceDate = date;
    }
    if (balance < 0 && withdrawalDate === null) withdrawalDate = date;
    days.push({ day: d, date, income, expenses, balance });
  }

  return {
    month: input.month,
    startBalance: r2(input.startBalance),
    days,
    minBalance,
    minBalanceDate,
    withdrawalNeeded: minBalance < 0,
    withdrawalAmount: minBalance < 0 ? r2(-minBalance) : 0,
    withdrawalDate,
  };
}
