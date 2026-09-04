import { describe, expect, it } from 'vitest';
import {
  distributeNetWorth, goalPositionsAt, goalsWithDeductions, planGoals, plannedRealizedByGoal,
  plannedTotalByGoal, projectedWealth, requiredHorizon, FreeBalancePoint,
} from './allocation';
import { monthRange } from './months';
import type { Goal, PlannedExpense } from '../types';

const goal = (o: Partial<Goal>): Goal => ({
  id: 'g1', profile_id: 'p', name: 'Meta', target_amount: 10000,
  priority: 1, paused: false, start_month: '2026-01-01', deadline: '2027-01-01',
  category: 'patrimonio', ...o,
});
const planned = (o: Partial<PlannedExpense>): PlannedExpense => ({
  id: 'pl1', profile_id: 'p', name: 'Previsão', total_amount: 1000, installments: 1,
  installment_amount: 1000, start_month: '2026-08-01', end_month: '2026-09-01',
  confirmed: false, active: true, is_card_expense: false, credit_card_id: null,
  due_day: null, goal_id: null, ...o,
});
const fb = (months: number, value: number, start = '2026-07-01'): FreeBalancePoint[] =>
  monthRange(start, months).map((month) => ({ month, freeBalance: value }));

describe('distributeNetWorth — posição pelo patrimônio', () => {
  it('preenche por prazo mais próximo, com teto no alvo e cascata do excedente', () => {
    const a = goal({ id: 'a', target_amount: 30000, deadline: '2026-12-01' });
    const b = goal({ id: 'b', target_amount: 80000, deadline: '2027-06-01' });
    const c = goal({ id: 'c', target_amount: 50000, deadline: '2028-12-01' });
    const pos = distributeNetWorth([a, b, c], 147000);
    expect(pos.get('a')).toBe(30000); // cheia
    expect(pos.get('b')).toBe(80000); // cheia
    expect(pos.get('c')).toBe(37000); // recebe o que sobra
  });

  it('meta pausada não recebe patrimônio', () => {
    const a = goal({ id: 'a', target_amount: 10000, deadline: '2026-12-01', paused: true });
    const b = goal({ id: 'b', target_amount: 10000, deadline: '2027-01-01' });
    const pos = distributeNetWorth([a, b], 10000);
    expect(pos.get('a') ?? 0).toBe(0);
    expect(pos.get('b')).toBe(10000);
  });
});

describe('goalPositionsAt — posição acumulada por mês', () => {
  it('posição cresce com os aportes e nunca passa do alvo', () => {
    // saldo livre = AM (1000): sem excedente para cascatear, a posição cresce em passos de 1000
    const g = goal({ id: 'g', target_amount: 12000, deadline: '2027-07-01' }); // 12 meses → AM 1000
    const plan = planGoals([g], 0, fb(24, 1000), '2026-07-01');
    const p0 = goalPositionsAt([g], 0, plan.monthly, '2026-07-01');
    const p3 = goalPositionsAt([g], 0, plan.monthly, '2026-10-01');
    const pEnd = goalPositionsAt([g], 0, plan.monthly, '2027-12-01');
    expect(p0.get('g')).toBe(1000); // 1 aporte
    expect(p3.get('g')).toBe(4000); // 4 aportes
    expect(pEnd.get('g')).toBe(12000); // teto no alvo
  });

  it('parte da posição inicial do patrimônio', () => {
    const g = goal({ id: 'g', target_amount: 12000, deadline: '2027-07-01' }); // faltante 6000 → AM 500
    const plan = planGoals([g], 6000, fb(24, 500), '2026-07-01');
    const p0 = goalPositionsAt([g], 6000, plan.monthly, '2026-07-01');
    expect(p0.get('g')).toBe(6500); // 6000 inicial + 500 do mês
  });
});

describe('planGoals — aporte mínimo', () => {
  it('AM = faltante / meses até o prazo', () => {
    const g = goal({ target_amount: 12000, deadline: '2027-07-01' }); // 12 meses
    const { statuses } = planGoals([g], 0, fb(24, 5000), '2026-07-01');
    expect(statuses[0].requiredMonthly).toBe(1000);
  });

  it('posição do patrimônio reduz o faltante', () => {
    const g = goal({ target_amount: 12000, deadline: '2027-07-01' });
    const { statuses } = planGoals([g], 6000, fb(24, 5000), '2026-07-01');
    expect(statuses[0].current).toBe(6000);
    expect(statuses[0].requiredMonthly).toBe(500); // 6000/12
  });
});

describe('planGoals — distribuição', () => {
  it('com capacidade, todos recebem o AM e excedente vai ao prazo mais próximo', () => {
    const a = goal({ id: 'a', name: 'A', target_amount: 6000, deadline: '2027-01-01', priority: 2 }); // AM 1000
    const b = goal({ id: 'b', name: 'B', target_amount: 24000, deadline: '2028-07-01', priority: 1 }); // AM 1000
    const { statuses, monthly } = planGoals([a, b], 0, fb(30, 3000), '2026-07-01');
    const m0 = monthly[0];
    const alloc = Object.fromEntries(m0.perGoal.map((p) => [p.goalId, p.amount]));
    expect(alloc['a']).toBe(2000); // AM 1000 + excedente 1000 (prazo mais próximo)
    expect(alloc['b']).toBe(1000); // apenas o AM
    expect(statuses.find((s) => s.goal.id === 'a')!.health).toBe('on_track');
  });

  it('em déficit, prioridade decide quem recebe', () => {
    const a = goal({ id: 'a', target_amount: 12000, deadline: '2027-07-01', priority: 2 }); // AM 1000
    const b = goal({ id: 'b', target_amount: 12000, deadline: '2027-07-01', priority: 1 }); // AM 1000
    const { monthly, alerts } = planGoals([a, b], 0, fb(24, 1500), '2026-07-01');
    const alloc = Object.fromEntries(monthly[0].perGoal.map((p) => [p.goalId, p.amount]));
    expect(alloc['b']).toBe(1000); // prioridade 1: AM inteiro
    expect(alloc['a']).toBe(500); // resto
    expect(monthly[0].deficit).toBe(500);
    expect(alerts.some((x) => x.includes('não cobre'))).toBe(true);
  });

  it('teto: alocação nunca excede o faltante; sobra vira surplus', () => {
    const a = goal({ id: 'a', target_amount: 1000, deadline: '2026-12-01' });
    const { monthly } = planGoals([a], 0, fb(6, 5000), '2026-07-01');
    expect(monthly[0].perGoal[0].amount).toBe(1000);
    expect(monthly[0].surplus).toBe(4000);
  });
});

describe('planGoals — saúde da meta', () => {
  it('on_track quando conclui até o prazo', () => {
    const g = goal({ target_amount: 6000, deadline: '2027-01-01' }); // AM 1000, cabe
    const { statuses } = planGoals([g], 0, fb(12, 2000), '2026-07-01');
    expect(statuses[0].health).toBe('on_track');
    expect(statuses[0].projectedCompletion! <= '2027-01-01').toBe(true);
  });

  it('late quando conclui depois do prazo', () => {
    const g = goal({ target_amount: 12000, deadline: '2026-10-01' }); // precisa 4000/mês
    const { statuses, alerts } = planGoals([g], 0, fb(24, 1000), '2026-07-01');
    expect(statuses[0].health).toBe('late');
    expect(alerts.some((a) => a.includes('depois do prazo'))).toBe(true);
  });

  it('infeasible quando não conclui no horizonte', () => {
    const g = goal({ target_amount: 500000, deadline: '2026-12-01' });
    const { statuses } = planGoals([g], 0, fb(12, 100), '2026-07-01');
    expect(statuses[0].health).toBe('infeasible');
  });

  it('paused fica fora da simulação', () => {
    const g = goal({ paused: true });
    const { statuses, monthly } = planGoals([g], 0, fb(6, 5000), '2026-07-01');
    expect(statuses[0].health).toBe('paused');
    expect(monthly.every((m) => m.perGoal.length === 0)).toBe(true);
  });

  it('achieved quando o patrimônio cobre o alvo', () => {
    const g = goal({ target_amount: 5000 });
    const { statuses } = planGoals([g], 5000, fb(6, 1000), '2026-07-01');
    expect(statuses[0].health).toBe('achieved');
  });

  it('meses sem saldo não alocam nada', () => {
    const g = goal({ target_amount: 6000, deadline: '2027-01-01' });
    const { monthly } = planGoals([g], 0, fb(3, -2000), '2026-07-01');
    expect(monthly[0].perGoal.length === 0 || monthly[0].perGoal[0].amount === 0).toBe(true);
    expect(monthly[0].deficit).toBeGreaterThan(0);
  });
});

describe('modo priority — cascata por prioridade', () => {
  it('distributeNetWorth reparte o patrimônio na ordem de prioridade', () => {
    const a = goal({ id: 'a', target_amount: 30000, deadline: '2026-12-01', priority: 2 });
    const b = goal({ id: 'b', target_amount: 80000, deadline: '2027-06-01', priority: 1 });
    const c = goal({ id: 'c', target_amount: 50000, deadline: '2028-12-01', priority: 3 });
    const pos = distributeNetWorth([a, b, c], 100000, 'priority');
    expect(pos.get('b')).toBe(80000); // prioridade 1: cheia primeiro
    expect(pos.get('a')).toBe(20000); // prioridade 2: recebe o que sobra
    expect(pos.get('c')).toBe(0); // prioridade 3: nada
  });

  it('todo o saldo livre vai à meta de maior prioridade, sem aporte mínimo nem déficit', () => {
    const a = goal({ id: 'a', target_amount: 6000, deadline: '2028-07-01', priority: 2 });
    const b = goal({ id: 'b', target_amount: 24000, deadline: '2028-07-01', priority: 1 });
    const { monthly, statuses } = planGoals([a, b], 0, fb(30, 3000), '2026-07-01', 'priority');
    const m0 = Object.fromEntries(monthly[0].perGoal.map((p) => [p.goalId, p.amount]));
    expect(m0['b']).toBe(3000); // prioridade 1 leva tudo
    expect(m0['a'] ?? 0).toBe(0); // prioridade 2 não recebe até b fechar
    expect(monthly[0].deficit).toBe(0); // não há déficit no modo prioridade
    // b conclui no mês 8 (24000/3000); só então a começa
    expect(statuses.find((s) => s.goal.id === 'a')!.health).toBe('on_track');
    expect(statuses.find((s) => s.goal.id === 'b')!.health).toBe('on_track');
  });

  it('excedente cascateia: se a meta prioritária fecha, a próxima recebe no mesmo mês', () => {
    const a = goal({ id: 'a', target_amount: 1000, deadline: '2028-07-01', priority: 1 });
    const b = goal({ id: 'b', target_amount: 9000, deadline: '2028-07-01', priority: 2 });
    const { monthly } = planGoals([a, b], 0, fb(24, 5000), '2026-07-01', 'priority');
    const m0 = Object.fromEntries(monthly[0].perGoal.map((p) => [p.goalId, p.amount]));
    expect(m0['a']).toBe(1000); // fecha a (teto no alvo)
    expect(m0['b']).toBe(4000); // excedente cascateia para b
  });

  it('goalPositionsAt segue a prioridade', () => {
    const a = goal({ id: 'a', target_amount: 3000, deadline: '2028-07-01', priority: 1 });
    const b = goal({ id: 'b', target_amount: 5000, deadline: '2028-07-01', priority: 2 });
    const plan = planGoals([a, b], 0, fb(24, 1000), '2026-07-01', 'priority');
    const p2 = goalPositionsAt([a, b], 0, plan.monthly, '2026-09-01', 'priority'); // 3 meses
    expect(p2.get('a')).toBe(3000); // a (prioridade 1) já cheia
    expect(p2.get('b')).toBe(0); // b ainda não começou
    const p3 = goalPositionsAt([a, b], 0, plan.monthly, '2026-10-01', 'priority'); // 4º mês
    expect(p3.get('b')).toBe(1000); // b começa após a fechar
  });
});

describe('projectedWealth — patrimônio ajustado por metas de gasto', () => {
  const raw = [
    { month: '2026-07-01', netWorth: 5000 },
    { month: '2026-08-01', netWorth: 8000 },
  ];

  it('sem metas de gasto, patrimônio fica igual ao bruto', () => {
    const g = goal({ category: 'patrimonio' });
    const { statuses, monthly } = planGoals([g], 0, fb(24, 2000), '2026-07-01');
    const out = projectedWealth(raw, [g], { statuses, monthly, alerts: [] });
    expect(out.map((p) => p.netWorth)).toEqual([5000, 8000]);
    expect(out.every((p) => p.reserved === 0)).toBe(true);
  });

  it('meta de gasto reserva o alvo assim que a simulação aloca (capacidade abundante) e desconta do patrimônio', () => {
    const g = goal({ category: 'gasto', target_amount: 1000, deadline: '2028-07-01' });
    const { statuses, monthly } = planGoals([g], 0, fb(24, 5000), '2026-07-01');
    const out = projectedWealth(raw, [g], { statuses, monthly, alerts: [] });
    expect(out[0]).toEqual({ month: '2026-07-01', netWorth: 4000, reserved: 1000 });
    // já reservado por completo — mês seguinte não desconta de novo, só mantém
    expect(out[1]).toEqual({ month: '2026-08-01', netWorth: 7000, reserved: 1000 });
  });

  it('meta de gasto pausada não entra no desconto', () => {
    const g = goal({ category: 'gasto', target_amount: 1000, paused: true });
    const { statuses, monthly } = planGoals([g], 0, fb(24, 5000), '2026-07-01');
    const out = projectedWealth(raw, [g], { statuses, monthly, alerts: [] });
    expect(out.map((p) => p.netWorth)).toEqual([5000, 8000]);
    expect(out.every((p) => p.reserved === 0)).toBe(true);
  });

  it('posição inicial (via patrimônio) já conta como reservado desde o primeiro mês', () => {
    const g = goal({ category: 'gasto', target_amount: 4000, deadline: '2028-07-01' });
    // patrimônio de 4000 já cobre a meta inteira antes de qualquer aporte futuro
    const { statuses, monthly } = planGoals([g], 4000, fb(24, 5000), '2026-07-01');
    const out = projectedWealth(raw, [g], { statuses, monthly, alerts: [] });
    expect(out[0]).toEqual({ month: '2026-07-01', netWorth: 1000, reserved: 4000 });
  });
});

describe('requiredHorizon', () => {
  it('cobre o último prazo ativo com folga', () => {
    const g = goal({ deadline: '2028-07-01' }); // 24 meses
    expect(requiredHorizon([g], '2026-07-01')).toBe(37);
  });
  it('cap em 300 e mínimo 24', () => {
    expect(requiredHorizon([goal({ deadline: '2060-01-01' })], '2026-07-01')).toBe(300);
    expect(requiredHorizon([goal({ paused: true })], '2026-07-01')).toBe(24);
  });
});

describe('plannedTotalByGoal / plannedRealizedByGoal / goalsWithDeductions — previsões vinculadas a metas', () => {
  it('plannedTotalByGoal soma o total (Previsto) das previsões ativas vinculadas à mesma meta', () => {
    const ps = [
      planned({ id: 'p1', goal_id: 'g1', total_amount: 5000 }),
      planned({ id: 'p2', goal_id: 'g1', total_amount: 2000 }),
      planned({ id: 'p3', goal_id: 'g2', total_amount: 1000 }),
    ];
    const byGoal = plannedTotalByGoal(ps);
    expect(byGoal.get('g1')).toBe(7000);
    expect(byGoal.get('g2')).toBe(1000);
  });

  it('plannedTotalByGoal ignora previsões inativas ou sem meta vinculada', () => {
    const ps = [
      planned({ id: 'p1', goal_id: 'g1', total_amount: 5000, active: false }),
      planned({ id: 'p2', goal_id: null, total_amount: 2000 }),
    ];
    expect(plannedTotalByGoal(ps).size).toBe(0);
  });

  it('plannedRealizedByGoal soma só as parcelas cujo mês já ocorreu (período ≤ refMonth)', () => {
    // previsão de 900 em 3 parcelas de 300 (jan, fev, mar/2026)
    const p = planned({ goal_id: 'g1', total_amount: 900, installments: 3, installment_amount: 300, start_month: '2026-01-01', end_month: '2026-04-01' });
    expect(plannedRealizedByGoal([p], '2025-12-01').get('g1') ?? 0).toBe(0); // antes de começar
    expect(plannedRealizedByGoal([p], '2026-01-01').get('g1')).toBe(300); // só a 1ª parcela
    expect(plannedRealizedByGoal([p], '2026-02-01').get('g1')).toBe(600); // 2 parcelas — exemplo do pedido
    expect(plannedRealizedByGoal([p], '2026-12-01').get('g1')).toBe(900); // todas já passaram, não passa do total
  });

  it('goalsWithDeductions deduz só o Realizado (não o Previsto) do alvo da meta', () => {
    // exemplo do pedido: Meta "Viagem para China" 60.000; previsão "Hotéis" 900 em 3x de 300,
    // com 2 parcelas já ocorridas (600 realizado) no mês de referência — alvo líquido 59.400.
    const china = goal({ id: 'g1', name: 'Viagem para China', target_amount: 60000 });
    const hoteis = planned({
      goal_id: 'g1', name: 'Hotéis', total_amount: 900, installments: 3, installment_amount: 300,
      start_month: '2026-01-01', end_month: '2026-04-01',
    });
    const out = goalsWithDeductions([china], [hoteis], '2026-02-01');
    expect(out[0].target_amount).toBe(59400);
  });

  it('parcelas futuras (ainda não realizadas) não reduzem o alvo', () => {
    const g = goal({ id: 'g1', target_amount: 60000 });
    const p = planned({ goal_id: 'g1', total_amount: 900, installments: 3, installment_amount: 300, start_month: '2026-05-01', end_month: '2026-08-01' });
    const out = goalsWithDeductions([g], [p], '2026-02-01'); // antes da 1ª parcela
    expect(out[0].target_amount).toBe(60000); // nada realizado ainda
  });

  it('sem previsão vinculada, a meta não muda', () => {
    const china = goal({ id: 'g1', target_amount: 60000 });
    const out = goalsWithDeductions([china], [], '2026-07-01');
    expect(out[0]).toBe(china); // sem deduções, devolve o mesmo objeto
    expect(out[0].target_amount).toBe(60000);
  });

  it('o alvo líquido nunca fica negativo (piso em 0) mesmo com Realizado acima do alvo', () => {
    const g = goal({ id: 'g1', target_amount: 3000 });
    const p = planned({ goal_id: 'g1', total_amount: 5000, installments: 1, installment_amount: 5000, start_month: '2026-07-01', end_month: '2026-08-01' });
    const out = goalsWithDeductions([g], [p], '2026-07-01'); // parcela única já realizada no mês
    expect(out[0].target_amount).toBe(0);
  });

  it('apagar a previsão (não passar mais no array) devolve o alvo original — nada é persistido', () => {
    const g = goal({ id: 'g1', target_amount: 60000 });
    const p = planned({ goal_id: 'g1', total_amount: 5000, installments: 1, installment_amount: 5000, start_month: '2026-07-01', end_month: '2026-08-01' });
    const withPlanned = goalsWithDeductions([g], [p], '2026-07-01');
    expect(withPlanned[0].target_amount).toBe(55000);
    const withoutPlanned = goalsWithDeductions([g], [], '2026-07-01');
    expect(withoutPlanned[0].target_amount).toBe(60000);
  });

  it('alvo líquido em 0 faz a meta ficar "achieved" em planGoals, mesmo sem posição', () => {
    const g = goal({ id: 'g1', target_amount: 3000, deadline: '2027-07-01' });
    const p = planned({ goal_id: 'g1', total_amount: 3000, installments: 1, installment_amount: 3000, start_month: '2026-07-01', end_month: '2026-08-01' });
    const netGoals = goalsWithDeductions([g], [p], '2026-07-01');
    const plan = planGoals(netGoals, 0, fb(12, 0), '2026-07-01');
    expect(plan.statuses[0].health).toBe('achieved');
    expect(plan.statuses[0].remaining).toBe(0);
  });
});
