import { planGoals, distributeNetWorth, FreeBalancePoint } from './lib/engine/allocation';
import { monthRange } from './lib/engine/months';
import type { Goal } from './lib/types';

const g = (o: Partial<Goal>): Goal => ({
  id: o.id!, profile_id: 'p', name: o.name!, target_amount: o.target_amount!,
  priority: o.priority!, paused: false, start_month: '2025-05-01', deadline: o.deadline!,
  category: (o.category as any) ?? 'patrimonio',
});
const goals = [
  g({ id:'viagem', name:'Viagem', target_amount:60000, priority:1, deadline:'2026-12-01', category:'gasto' }),
  g({ id:'reserva', name:'Reserva', target_amount:200000, priority:2, deadline:'2027-08-01' }),
  g({ id:'carro', name:'Carro', target_amount:250000, priority:3, deadline:'2028-12-01', category:'gasto' }),
  g({ id:'prev', name:'Previdencia', target_amount:1000000, priority:4, deadline:'2050-12-01' }),
];

for (const NW of [80000, 234000]) {
  const months = monthRange('2026-07-01', 30);
  const fb: FreeBalancePoint[] = months.map((m) => {
    let v = 500;
    if (m==='2026-11-01') v = 26000;
    if (m==='2026-12-01') v = 19000;
    if (m==='2027-06-01') v = 16000;
    if (m==='2027-11-01') v = 27000;
    return { month: m, freeBalance: v };
  });
  const pos = distributeNetWorth(goals, NW, 'priority');
  const plan = planGoals(goals, NW, fb, '2026-07-01', 'priority');
  console.log(`\n===== netWorth=${NW} =====`);
  console.log('posicao inicial:', [...pos.entries()].map(([k,v])=>`${k}:${v}`).join(' '));
  for (const mth of ['2026-11-01','2026-12-01','2027-06-01','2027-11-01']) {
    const mm = plan.monthly.find(x=>x.month===mth);
    console.log(mth, (mm?.perGoal ?? []).map(p=>`${p.goalId}:${p.amount}`).join(' ') || '(sem aporte)');
  }
  console.log('status:', plan.statuses.map(s=>`${s.goal.id}:${s.health}`).join(' '));
}
