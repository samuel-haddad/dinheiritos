// Motor de alocação de metas v2 — função pura (ver docs/PROJECTION_ENGINE.md §2).
//
// Sem pesos. Dois modos de distribuição, escolhidos pelo usuário (AllocationMode):
//
//   'am' (Aporte Mínimo): cada meta ativa tem um APORTE MÍNIMO autoajustável
//     AM(meta, mês) = faltante ÷ meses até o prazo. A cada mês simulado todas as
//     metas ativas recebem seu AM (se o saldo permitir); o excedente vai para a
//     meta de prazo mais próximo; em déficit, financia-se na ordem de prioridade.
//
//   'priority' (Prioridade): todo o saldo livre do mês vai para a meta de maior
//     prioridade (menor `priority`) até completá-la; o excedente cascateia para a
//     próxima. Não há aporte mínimo nem déficit — só a ordem de prioridade importa.
import type { AllocationMode, Goal, Month, PlannedExpense } from '../types';
import { addMonths, diffMonths } from './months';

export type GoalHealth = 'achieved' | 'paused' | 'on_track' | 'late' | 'infeasible';

export interface GoalStatus {
  goal: Goal;
  current: number; // Σ contribuições registradas
  remaining: number; // target − current (mín. 0)
  monthsLeft: number; // do mês de referência até o prazo
  requiredMonthly: number; // AM do mês de referência
  suggestedThisMonth: number; // alocação simulada no mês de referência
  projectedCompletion: Month | null; // quando a simulação conclui a meta
  health: GoalHealth;
}

export interface MonthAllocation {
  month: Month;
  perGoal: { goalId: string; amount: number }[];
  deficit: number; // quanto faltou para cobrir todos os AMs (0 = coberto)
  surplus: number; // sobra sem destino após tetos
}

export interface GoalPlan {
  statuses: GoalStatus[];
  monthly: MonthAllocation[];
  alerts: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

export interface FreeBalancePoint {
  month: Month;
  freeBalance: number;
}

/**
 * Soma, por meta, o `total_amount` das previsões ativas vinculadas a ela
 * (`planned_expenses.goal_id`) — o compromisso **total** (já realizado + a realizar) com
 * gastos já previstos para essa meta (ex.: meta "Viagem" com previsão "Hotéis" vinculada).
 * É o "Previsto" exibido na tela de Metas. Ver docs/PROJECTION_ENGINE.md §2.
 */
export function plannedTotalByGoal(plannedExpenses: PlannedExpense[]): Map<string, number> {
  const byGoal = new Map<string, number>();
  for (const p of plannedExpenses) {
    if (p.active && p.goal_id) {
      byGoal.set(p.goal_id, r2((byGoal.get(p.goal_id) ?? 0) + Number(p.total_amount)));
    }
  }
  return byGoal;
}

/**
 * Soma, por meta, o quanto das previsões vinculadas já foi **Realizado**: parcelas cujo
 * mês já ocorreu (mês da parcela ≤ `refMonth`). É a fração do "Previsto"
 * (`plannedTotalByGoal`) que já efetivamente saiu do patrimônio — o restante (Previsto −
 * Realizado) ainda vai acontecer em meses futuros. Ver docs/PROJECTION_ENGINE.md §2.
 */
export function plannedRealizedByGoal(plannedExpenses: PlannedExpense[], refMonth: Month): Map<string, number> {
  const byGoal = new Map<string, number>();
  for (const p of plannedExpenses) {
    if (!p.active || !p.goal_id) continue;
    // nº de parcelas com mês ∈ [start_month, refMonth] (0 se a primeira ainda não chegou)
    const elapsed = diffMonths(p.start_month, refMonth) + 1;
    const realizedInstallments = Math.min(p.installments, Math.max(0, elapsed));
    if (realizedInstallments <= 0) continue;
    const amount = r2(realizedInstallments * Number(p.installment_amount));
    byGoal.set(p.goal_id, r2((byGoal.get(p.goal_id) ?? 0) + amount));
  }
  return byGoal;
}

/**
 * Metas com o alvo líquido do que já foi **Realizado** em previsões vinculadas (piso em 0)
 * — não do "Previsto" total. Motivo: só a parcela já ocorrida efetivamente saiu do
 * patrimônio (o resto ainda não aconteceu, então não deve reduzir o quanto ainda precisa
 * ser reservado). Identidade que passa a valer em toda a tela de Metas:
 *
 *   Meta (target_amount original) = Reservado (posição/`current`) + Realizado + Faltante
 *
 * Nada é persistido — recalculado a cada carga a partir de `refMonth` e das previsões
 * ativas, então apagar/desativar a previsão ou o tempo passar (parcela vira "realizada")
 * ajustam o alvo líquido sozinhos. Quando ele chega a 0, a meta fica automaticamente
 * `achieved` em `planGoals` (`remaining = max(0, alvo − posição) = 0`, qualquer que seja a
 * posição). Passe o resultado, não `goals` cru, para `planGoals`/`distributeNetWorth`/
 * `goalPositionsAt`/`projectedWealth` sempre que houver `plannedExpenses` disponíveis — a
 * única exceção é o CRUD de metas em si (criar/editar), que deve ler/gravar o
 * `target_amount` original.
 */
export function goalsWithDeductions(goals: Goal[], plannedExpenses: PlannedExpense[], refMonth: Month): Goal[] {
  const realized = plannedRealizedByGoal(plannedExpenses, refMonth);
  if (realized.size === 0) return goals;
  return goals.map((g) => {
    const ded = realized.get(g.id);
    if (!ded) return g;
    return { ...g, target_amount: r2(Math.max(0, Number(g.target_amount) - ded)) };
  });
}

/** Ordena metas ativas conforme o modo: por prazo (am) ou por prioridade (priority). */
function orderGoals(goals: Goal[], mode: AllocationMode): Goal[] {
  const byDeadline = (a: Goal, b: Goal) =>
    a.deadline.localeCompare(b.deadline) || a.priority - b.priority;
  const byPriority = (a: Goal, b: Goal) =>
    a.priority - b.priority || a.deadline.localeCompare(b.deadline);
  return [...goals].sort(mode === 'priority' ? byPriority : byDeadline);
}

/**
 * Posição atual das metas (5.3): distribui o patrimônio (contas + investimentos)
 * entre as metas ativas, com teto no valor-alvo — o excedente cascateia para a
 * próxima meta. A ordem segue o modo: prazo mais próximo (`am`) ou prioridade
 * (`priority`). Metas pausadas não recebem posição.
 */
export function distributeNetWorth(
  goals: Goal[],
  netWorth: number,
  mode: AllocationMode = 'am'
): Map<string, number> {
  const positions = new Map<string, number>();
  const ordered = orderGoals(
    goals.filter((g) => !g.paused),
    mode
  );
  let capacity = Math.max(0, Number(netWorth) || 0);
  for (const g of ordered) {
    const take = Math.min(Number(g.target_amount), capacity);
    positions.set(g.id, r2(take));
    capacity -= take;
  }
  return positions;
}

/**
 * Simula a alocação mês a mês. A posição inicial de cada meta vem do patrimônio
 * (`netWorth`) distribuído por `distributeNetWorth`; o saldo livre futuro preenche
 * o faltante. `freeBalances` deve cobrir pelo menos até o último prazo ativo.
 */
export function planGoals(
  goals: Goal[],
  netWorth: number,
  freeBalances: FreeBalancePoint[],
  refMonth: Month,
  mode: AllocationMode = 'am'
): GoalPlan {
  const alerts: string[] = [];

  const positions = distributeNetWorth(goals, netWorth, mode);
  const base = goals.map((goal) => {
    const current = positions.get(goal.id) ?? 0;
    const remaining = Math.max(0, Number(goal.target_amount) - current);
    return { goal, current: r2(current), remaining: r2(remaining) };
  });

  const isActive = (b: { goal: Goal; remaining: number }) =>
    !b.goal.paused && b.remaining > EPS;

  // Estado mutável da simulação
  const sim = new Map(base.map((b) => [b.goal.id, { ...b, done: null as Month | null }]));
  const firstMonthAlloc = new Map<string, number>();
  const monthly: MonthAllocation[] = [];

  const am = (remaining: number, month: Month, deadline: Month) =>
    remaining / Math.max(1, diffMonths(month, deadline));

  for (const point of freeBalances) {
    const month = point.month;
    const active = [...sim.values()].filter((s) => isActive(s) && !s.done);
    if (active.length === 0) break;

    let capacity = Math.max(0, Number(point.freeBalance));
    const allocs = new Map<string, number>();
    let deficit = 0;

    if (mode === 'priority') {
      // Prioridade: todo o saldo livre vai para a meta de maior prioridade (menor
      // `priority`) até completá-la; o excedente cascateia para a próxima. Sem AM,
      // sem déficit — nenhuma meta tem "aporte mínimo" a cumprir.
      const byPriority = orderGoals(
        active.map((s) => s.goal),
        'priority'
      );
      for (const goal of byPriority) {
        if (capacity <= EPS) break;
        const s = sim.get(goal.id)!;
        const take = Math.min(s.remaining, capacity);
        if (take > EPS) {
          allocs.set(goal.id, take);
          capacity -= take;
        }
      }
    } else {
      // Aporte Mínimo (comportamento anterior)
      const needs = active.map((s) => ({
        s,
        need: Math.min(s.remaining, am(s.remaining, month, s.goal.deadline)),
      }));
      const totalNeed = needs.reduce((t, n) => t + n.need, 0);

      if (capacity + EPS >= totalNeed) {
        // 1) todos recebem seu AM
        for (const { s, need } of needs) allocs.set(s.goal.id, need);
        capacity -= totalNeed;
        // 2) excedente → prazo mais próximo, com teto no faltante, em cascata
        const byDeadline = [...active].sort((a, b) => a.goal.deadline.localeCompare(b.goal.deadline));
        for (const s of byDeadline) {
          if (capacity <= EPS) break;
          const already = allocs.get(s.goal.id) ?? 0;
          const room = s.remaining - already;
          const extra = Math.min(room, capacity);
          if (extra > EPS) {
            allocs.set(s.goal.id, already + extra);
            capacity -= extra;
          }
        }
      } else {
        // Déficit: financia na ordem de prioridade (empate: prazo mais próximo)
        deficit = totalNeed - capacity;
        const byPriority = [...needs].sort(
          (a, b) =>
            a.s.goal.priority - b.s.goal.priority ||
            a.s.goal.deadline.localeCompare(b.s.goal.deadline)
        );
        for (const { s, need } of byPriority) {
          if (capacity <= EPS) break;
          const amount = Math.min(need, capacity);
          allocs.set(s.goal.id, amount);
          capacity -= amount;
        }
      }
    }

    // aplica alocações
    const perGoal: { goalId: string; amount: number }[] = [];
    allocs.forEach((amount, goalId) => {
      const s = sim.get(goalId)!;
      s.remaining = r2(s.remaining - amount);
      if (s.remaining <= EPS && !s.done) s.done = month;
      perGoal.push({ goalId, amount: r2(amount) });
      if (month === refMonth) firstMonthAlloc.set(goalId, r2(amount));
    });
    monthly.push({ month, perGoal, deficit: r2(deficit), surplus: r2(Math.max(0, capacity)) });
  }

  const statuses: GoalStatus[] = base.map(({ goal, current, remaining }) => {
    const s = sim.get(goal.id)!;
    const monthsLeft = Math.max(0, diffMonths(refMonth, goal.deadline));
    const requiredMonthly = r2(remaining > 0 ? am(remaining, refMonth, goal.deadline) : 0);
    let health: GoalHealth;
    if (remaining <= EPS) health = 'achieved';
    else if (goal.paused) health = 'paused';
    else if (s.done && s.done <= goal.deadline) health = 'on_track';
    else if (s.done) health = 'late';
    else health = 'infeasible';

    if (health === 'late') {
      alerts.push(
        `Meta "${goal.name}": conclusão projetada para ${s.done} — depois do prazo (${goal.deadline}). ` +
          `Considere adiar o prazo, reduzir o alvo ou repriorizar.`
      );
    } else if (health === 'infeasible') {
      alerts.push(
        `Meta "${goal.name}": não conclui dentro do horizonte simulado. ` +
          `Aporte mínimo hoje seria ${requiredMonthly.toFixed(2)}/mês.`
      );
    }

    return {
      goal,
      current,
      remaining,
      monthsLeft,
      requiredMonthly,
      suggestedThisMonth: firstMonthAlloc.get(goal.id) ?? 0,
      projectedCompletion: s.done,
      health,
    };
  });

  const first = monthly[0];
  if (first && first.deficit > EPS) {
    alerts.unshift(
      `Saldo livre deste mês não cobre os aportes mínimos (faltam R$ ${first.deficit.toFixed(2)}). ` +
        `Metas de menor prioridade ficam sem aporte.`
    );
  }

  return { statuses, monthly, alerts };
}

/**
 * Posição projetada de cada meta ao FIM de `month`: posição inicial (patrimônio
 * distribuído) + aportes simulados de todos os meses até `month` (inclusive), com
 * teto no alvo. `monthly` deve estar em ordem cronológica (saída de `planGoals`).
 * Retorna Map<goalId, posição>.
 */
export function goalPositionsAt(
  goals: Goal[],
  netWorth: number,
  monthly: MonthAllocation[],
  month: Month,
  mode: AllocationMode = 'am'
): Map<string, number> {
  const targetById = new Map(goals.map((g) => [g.id, Number(g.target_amount)]));
  const pos = new Map<string, number>(distributeNetWorth(goals, netWorth, mode));
  for (const m of monthly) {
    if (m.month > month) break;
    for (const pg of m.perGoal) {
      const cap = targetById.get(pg.goalId) ?? Infinity;
      pos.set(pg.goalId, r2(Math.min(cap, (pos.get(pg.goalId) ?? 0) + pg.amount)));
    }
  }
  // garante entrada para toda meta (mesmo sem aporte/posição)
  for (const g of goals) if (!pos.has(g.id)) pos.set(g.id, 0);
  return pos;
}

export interface NetWorthPoint {
  month: Month;
  netWorth: number;
}

export interface ProjectedWealthPoint {
  month: Month;
  /** Patrimônio bruto menos o reservado para metas de gasto (docs/PROJECTION_ENGINE.md §1). */
  netWorth: number;
  /** Quanto do patrimônio bruto está reservado para metas de gasto neste mês. */
  reserved: number;
}

/**
 * Patrimônio Projetado ajustado (docs/PROJECTION_ENGINE.md §1): desconta do patrimônio
 * bruto o valor já reservado, mês a mês, para metas de categoria `gasto` não pausadas.
 * Não muda a alocação em si — `plan` é o resultado normal de `planGoals`, sem alterações;
 * esta função só lê esse resultado. `rawNetWorth` deve estar em ordem cronológica.
 */
export function projectedWealth(
  rawNetWorth: NetWorthPoint[],
  goals: Goal[],
  plan: GoalPlan
): ProjectedWealthPoint[] {
  const spendingGoals = goals.filter((g) => g.category === 'gasto' && !g.paused);
  if (spendingGoals.length === 0) {
    return rawNetWorth.map((p) => ({ month: p.month, netWorth: p.netWorth, reserved: 0 }));
  }

  const statusByGoal = new Map(plan.statuses.map((s) => [s.goal.id, s]));
  const reservedByGoal = new Map(
    spendingGoals.map((g) => [g.id, statusByGoal.get(g.id)?.current ?? 0])
  );
  const allocByMonth = new Map(
    plan.monthly.map((m) => [m.month, new Map(m.perGoal.map((p) => [p.goalId, p.amount]))])
  );

  return rawNetWorth.map((p) => {
    let reserved = 0;
    for (const g of spendingGoals) {
      const add = allocByMonth.get(p.month)?.get(g.id) ?? 0;
      const next = Math.min(Number(g.target_amount), (reservedByGoal.get(g.id) ?? 0) + add);
      reservedByGoal.set(g.id, next);
      reserved += next;
    }
    return { month: p.month, netWorth: r2(p.netWorth - reserved), reserved: r2(reserved) };
  });
}

/** Horizonte que a simulação precisa: até o último prazo ativo (cap 300 meses). */
export function requiredHorizon(goals: Goal[], refMonth: Month): number {
  const active = goals.filter((g) => !g.paused);
  if (active.length === 0) return 24;
  const maxDeadline = active.reduce((m, g) => (g.deadline > m ? g.deadline : m), refMonth);
  return Math.min(300, Math.max(24, diffMonths(refMonth, maxDeadline) + 13));
}

export { addMonths };
