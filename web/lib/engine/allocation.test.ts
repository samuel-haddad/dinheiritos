import { describe, expect, it } from 'vitest';
import { distributeNetWorth, planGoals, projectedWealth, requiredHorizon, FreeBalancePoint } from './allocation';
import { monthRange } from './months';
import type { Goal } from '../types';

const goal = (o: Partial<Goal>): Goal => ({
  id: 'g1', profile_id: 'p', name: 'Meta', target_amount: 10000,
  priority: 1, paused: false, start_month: '2026-01-01', deadline: '2027-01-01',
  category: 'patrimonio', ...o,
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
