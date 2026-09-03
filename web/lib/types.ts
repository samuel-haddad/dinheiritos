// Tipos do domínio — espelham docs/DATA_MODEL.md
// Meses são strings 'YYYY-MM-01'.

export type Month = string;

export interface Profile {
  id: string;
  name: string;
}

export type Periodicity = 'mensal' | 'anual' | 'custom';

export interface RecurringIncome {
  id: string;
  profile_id: string;
  name: string;
  amount: number;
  receipt_day: number | null;
  start_month: Month;
  end_month: Month | null;
  active: boolean;
  /** Rótulo da periodicidade; o intervalo efetivo está em interval_months. */
  periodicity: Periodicity;
  /** Meses entre ocorrências (mensal=1, anual=12, custom=N). */
  interval_months: number;
}

export interface RecurringExpense {
  id: string;
  profile_id: string;
  name: string;
  amount: number;
  start_month: Month;
  end_month: Month | null;
  active: boolean;
  periodicity: Periodicity;
  interval_months: number;
  /** Dia do mês em que a despesa é paga (fluxo de caixa diário). Sem valor = assume dia 1. */
  payment_day: number | null;
}

export interface OneOffIncome {
  id: string;
  profile_id: string;
  name: string;
  amount: number;
  expected_date: string;
  confirmed: boolean;
  active: boolean;
}

export interface PlannedExpense {
  id: string;
  profile_id: string;
  name: string;
  total_amount: number;
  installments: number;
  installment_amount: number;
  start_month: Month;
  end_month: Month;
  confirmed: boolean;
  active: boolean;
  /**
   * Previsão vinculada a um cartão (`credit_card_id`): quando a fatura do mês já foi
   * lançada em `card_bills`, a parcela daquele mês não soma nos cálculos (o gasto já
   * está refletido na fatura real) — ver docs/PROJECTION_ENGINE.md §1.
   */
  is_card_expense: boolean;
  credit_card_id: string | null;
  /** Dia do mês em que a parcela vence (fluxo de caixa diário). Sem valor = assume dia 1. */
  due_day: number | null;
}

export interface Account {
  id: string;
  profile_id: string;
  name: string;
  institution: string | null;
  logo_url: string | null;
  active: boolean;
}

export interface AccountSnapshot {
  id: string;
  account_id: string;
  month: Month;
  balance: number;
}

export interface CreditCard {
  id: string;
  profile_id: string;
  name: string;
  due_day: number | null;
  base_amount: number;
  logo_url: string | null;
  active: boolean;
}

export interface CardBill {
  id: string;
  credit_card_id: string;
  month: Month;
  amount: number;
}

export interface Investment {
  id: string;
  profile_id: string;
  name: string;
  institution: string | null;
  type: string | null;
  active: boolean;
}

export interface InvestmentSnapshot {
  id: string;
  investment_id: string;
  month: Month;
  balance: number;
}

/**
 * Modo de distribuição de aportes (docs/PROJECTION_ENGINE.md §2):
 * 'am' — Aporte Mínimo autoajustável (cada meta recebe seu mínimo por prazo);
 * 'priority' — todo o saldo livre vai para a meta de maior prioridade até 100%,
 * depois cascateia para a próxima (menor priority = mais prioritária).
 */
export type AllocationMode = 'am' | 'priority';

export type GoalCategory = 'gasto' | 'patrimonio';

export interface Goal {
  id: string;
  profile_id: string;
  name: string;
  target_amount: number;
  /** Desempate quando o saldo do mês não cobre todos os aportes mínimos (menor = mais prioritária). */
  priority: number;
  paused: boolean;
  start_month: Month;
  deadline: Month;
  /**
   * 'gasto': compromisso futuro que vai consumir patrimônio (reforma, viagem) — entra no
   * desconto do Patrimônio Projetado (docs/PROJECTION_ENGINE.md §1). 'patrimonio': construção
   * de patrimônio (reserva, previdência) — não desconta. Não muda a alocação/aporte (§2).
   */
  category: GoalCategory;
}

export interface AppSettings {
  allocation_mode: AllocationMode;
}

export interface MonthlyProjection {
  id: string;
  month: Month;
  total_income: number;
  total_expenses: number;
  free_balance: number;
  goal_allocation: number;
  net_worth: number;
  is_closed: boolean;
}
