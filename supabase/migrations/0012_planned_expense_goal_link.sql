-- 0012_planned_expense_goal_link.sql
-- Previsões (planned_expenses) podem ser vinculadas a uma meta: enquanto a previsão
-- estiver ativa, seu total_amount é deduzido do target_amount da meta (calculado no
-- cliente, nunca persistido — ver docs/PROJECTION_ENGINE.md §2). Apagar/desativar a
-- previsão devolve o valor automaticamente, pois nada na meta é reescrito.

alter table public.planned_expenses
  add column if not exists goal_id uuid references public.goals(id);
