'use client';

// Carrega todos os insumos do motor de projeção em paralelo.
import { supabase } from './supabase';
import type {
  Account,
  AccountSnapshot,
  CardBill,
  CreditCard,
  Goal,
  Investment,
  InvestmentSnapshot,
  MonthlyProjection,
  OneOffIncome,
  PlannedExpense,
  Profile,
  RecurringExpense,
  RecurringIncome,
} from './types';

export interface AppData {
  profiles: Profile[];
  recurringIncomes: RecurringIncome[];
  recurringExpenses: RecurringExpense[];
  oneOffIncomes: OneOffIncome[];
  plannedExpenses: PlannedExpense[];
  accounts: Account[];
  accountSnapshots: AccountSnapshot[];
  creditCards: CreditCard[];
  cardBills: CardBill[];
  investments: Investment[];
  investmentSnapshots: InvestmentSnapshot[];
  goals: Goal[];
  monthlyProjections: MonthlyProjection[];
}

async function all<T>(table: string, order?: string): Promise<T[]> {
  const q = supabase().from(table).select('*');
  const { data, error } = order ? await q.order(order) : await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

export async function loadAppData(): Promise<AppData> {
  const [
    profiles, recurringIncomes, recurringExpenses, oneOffIncomes, plannedExpenses,
    accounts, accountSnapshots, creditCards, cardBills,
    investments, investmentSnapshots, goals, monthlyProjections,
  ] = await Promise.all([
    all<Profile>('profiles'),
    all<RecurringIncome>('recurring_incomes'),
    all<RecurringExpense>('recurring_expenses'),
    all<OneOffIncome>('one_off_incomes'),
    all<PlannedExpense>('planned_expenses'),
    all<Account>('accounts'),
    all<AccountSnapshot>('account_snapshots', 'month'),
    all<CreditCard>('credit_cards'),
    all<CardBill>('card_bills', 'month'),
    all<Investment>('investments'),
    all<InvestmentSnapshot>('investment_snapshots', 'month'),
    all<Goal>('goals'),
    all<MonthlyProjection>('monthly_projections', 'month'),
  ]);
  return {
    profiles, recurringIncomes, recurringExpenses, oneOffIncomes, plannedExpenses,
    accounts, accountSnapshots, creditCards, cardBills,
    investments, investmentSnapshots, goals, monthlyProjections,
  };
}

/** Patrimônio de partida: último snapshot de cada conta e investimento. */
export function currentNetWorth(data: AppData): number {
  const latest = new Map<string, { month: string; balance: number }>();
  for (const s of data.accountSnapshots) {
    const k = `a|${s.account_id}`;
    if (!latest.has(k) || s.month > latest.get(k)!.month) latest.set(k, s);
  }
  for (const s of data.investmentSnapshots) {
    const k = `i|${s.investment_id}`;
    if (!latest.has(k) || s.month > latest.get(k)!.month) latest.set(k, s);
  }
  let total = 0;
  latest.forEach((v) => (total += Number(v.balance)));
  return Math.round(total * 100) / 100;
}

export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
