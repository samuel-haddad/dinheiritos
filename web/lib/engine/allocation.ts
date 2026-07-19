// Motor de alocação de metas v2 — função pura (ver docs/PROJECTION_ENGINE.md §2).
//
// Sem pesos. Cada meta ativa tem um APORTE MÍNIMO autoajustável:
//   AM(meta, mês) = faltante ÷ meses até o prazo
// A cada mês simulado: todas as metas ativas recebem seu AM (se o saldo
// permitir); o excedente vai para a meta de prazo mais próximo; em déficit,
// financia-se na ordem de prioridade (menor primeiro, empate por prazo).
import type { Goal, Month } from '../types';
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
 * Posição atual das metas (5.3): distribui o patrimônio (contas + investimentos)
 * entre as metas ativas na ordem de prazo mais próximo (empate por prioridade),
 * com teto no valor-alvo — o excedente cascateia para a próxima meta.
 * Metas pausadas não recebem posição.
 */
export function distributeNetWorth(goals: Goal[], netWorth: number): Map<string, number> {
  const positions = new Map<string, number>();
  const ordered = goals
    .filter((g) => !g.paused)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.priority - b.priority);
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
  refMonth: Month
): GoalPlan {
  const alerts: string[] = [];

  const positions = distributeNetWorth(goals, netWorth);
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
    const needs = active.map((s) => ({
      s,
      need: Math.min(s.remaining, am(s.remaining, month, s.goal.deadline)),
    }));
    const totalNeed = needs.reduce((t, n) => t + n.need, 0);

    let deficit = 0;
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

/** Horizonte que a simulação precisa: até o último prazo ativo (cap 300 meses). */
export function requiredHorizon(goals: Goal[], refMonth: Month): number {
  const active = goals.filter((g) => !g.paused);
  if (active.length === 0) return 24;
  const maxDeadline = active.reduce((m, g) => (g.deadline > m ? g.deadline : m), refMonth);
  return Math.min(300, Math.max(24, diffMonths(refMonth, maxDeadline) + 13));
}

export { addMonths };
