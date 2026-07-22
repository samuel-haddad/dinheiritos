// Histórico de meses fechados — derivado on-the-fly, sem evento de "fechar mês".
// Ver docs/PROJECTION_ENGINE.md §3. As métricas atuais/futuras já são recalculadas
// no cliente a cada carga; aqui reconstruímos o "real" dos meses vencidos a partir
// do próprio motor de projeção + os snapshots observados. Não há escrita no banco.
import type {
  AccountSnapshot,
  CardBill,
  CreditCard,
  InvestmentSnapshot,
  Month,
  MonthlyProjection,
  OneOffIncome,
  PlannedExpense,
  RecurringExpense,
  RecurringIncome,
} from './types';
import { diffMonths } from './engine/months';
import { project } from './engine/projection';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Uma linha de mês fechado (histórico "real") exibida na tabela saldo. */
export interface ClosedRow {
  month: Month;
  receitas: number;
  despesas: number;
  saldo: number;
  aportes: number;
  patrimonio: number;
  real: boolean;
}

export interface HistoryInput {
  /** Mês atual (primeiro projetado). Meses < startMonth são "fechados". */
  startMonth: Month;
  recurringIncomes: RecurringIncome[];
  oneOffIncomes: OneOffIncome[];
  recurringExpenses: RecurringExpense[];
  plannedExpenses: PlannedExpense[];
  creditCards: CreditCard[];
  cardBills: CardBill[];
  accountSnapshots: AccountSnapshot[];
  investmentSnapshots: InvestmentSnapshot[];
  /** monthly_projections — usada só como semente para os meses legados. */
  legacy: MonthlyProjection[];
}

/**
 * Patrimônio **observado** no mês: soma do último snapshot com `month ≤ target` de
 * cada conta e investimento. É o patrimônio real do fechamento (não o acumulado do motor).
 */
export function netWorthAt(
  accountSnapshots: AccountSnapshot[],
  investmentSnapshots: InvestmentSnapshot[],
  target: Month,
): number {
  const latest = new Map<string, { month: Month; balance: number }>();
  for (const s of accountSnapshots) {
    if (s.month > target) continue;
    const k = `a|${s.account_id}`;
    const cur = latest.get(k);
    if (!cur || s.month > cur.month) latest.set(k, s);
  }
  for (const s of investmentSnapshots) {
    if (s.month > target) continue;
    const k = `i|${s.investment_id}`;
    const cur = latest.get(k);
    if (!cur || s.month > cur.month) latest.set(k, s);
  }
  let total = 0;
  latest.forEach((v) => (total += Number(v.balance)));
  return r2(total);
}

/**
 * Menor `start_month` entre as recorrentes — antes disso o motor não reconstrói o mês
 * (não há insumos). Retorna null se não houver recorrentes.
 */
export function firstReconstructibleMonth(
  recurringIncomes: RecurringIncome[],
  recurringExpenses: RecurringExpense[],
): Month | null {
  let min: Month | null = null;
  for (const r of recurringIncomes) if (min === null || r.start_month < min) min = r.start_month;
  for (const r of recurringExpenses) if (min === null || r.start_month < min) min = r.start_month;
  return min;
}

/**
 * Linhas de meses fechados (histórico), **derivadas** em vez de cacheadas:
 *  - meses ∈ [primeira recorrente, mês atual) → reconstruídos por `project()` + patrimônio
 *    observado dos snapshots (`netWorthAt`); a fatura entra real quando existe em `card_bills`;
 *  - meses anteriores (legados, não reconstituíveis: as recorrentes começam em 2026-07) →
 *    vêm de `monthly_projections` como semente estática.
 *
 * `free_balance = receita − despesa` (estimativa da época, fiel porque mudanças em
 * recorrentes preservam histórico); `patrimonio` é o real observado. Aportes de meses
 * fechados não são reconstituíveis (não são persistidos) → 0.
 */
export function deriveHistory(input: HistoryInput): ClosedRow[] {
  const { startMonth } = input;
  const firstRecon = firstReconstructibleMonth(input.recurringIncomes, input.recurringExpenses);
  const legacyCut = firstRecon ?? startMonth;

  const legacyRows: ClosedRow[] = input.legacy
    .filter((m) => m.is_closed && m.month < legacyCut)
    .map((m) => ({
      month: m.month,
      receitas: Number(m.total_income),
      despesas: Number(m.total_expenses),
      saldo: Number(m.free_balance),
      aportes: Number(m.goal_allocation),
      patrimonio: Number(m.net_worth),
      real: true,
    }));

  const derivedRows: ClosedRow[] = [];
  if (firstRecon && firstRecon < startMonth) {
    const horizon = diffMonths(firstRecon, startMonth); // nº de meses de [firstRecon, startMonth)
    const proj = project({
      startMonth: firstRecon,
      horizon,
      initialNetWorth: 0, // irrelevante p/ receita/despesa; patrimônio vem dos snapshots
      recurringIncomes: input.recurringIncomes,
      oneOffIncomes: input.oneOffIncomes,
      recurringExpenses: input.recurringExpenses,
      plannedExpenses: input.plannedExpenses,
      creditCards: input.creditCards,
      cardBills: input.cardBills,
    });
    for (const p of proj) {
      derivedRows.push({
        month: p.month,
        receitas: p.totalIncome,
        despesas: p.totalExpenses,
        saldo: p.freeBalance,
        aportes: 0,
        patrimonio: netWorthAt(input.accountSnapshots, input.investmentSnapshots, p.month),
        real: true,
      });
    }
  }

  return [...legacyRows, ...derivedRows].sort((a, b) => a.month.localeCompare(b.month));
}
