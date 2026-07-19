-- 0004_recurring_periodicity.sql
-- Fase 5.1.2 — periodicidade das receitas/despesas recorrentes.
-- `periodicity`: rótulo semântico ('mensal' | 'anual' | 'custom').
-- `interval_months`: intervalo efetivo entre ocorrências (mensal=1, anual=12, custom=N).
-- O motor conta a recorrência a cada `interval_months` a partir de `start_month`.
-- Previsões (planned_expenses) NÃO recebem periodicidade — seguem parceladas mês a mês.

alter table public.recurring_incomes
  add column if not exists periodicity     text not null default 'mensal',
  add column if not exists interval_months  int  not null default 1;

alter table public.recurring_expenses
  add column if not exists periodicity     text not null default 'mensal',
  add column if not exists interval_months  int  not null default 1;

alter table public.recurring_incomes
  add constraint recurring_incomes_periodicity_chk check (periodicity in ('mensal', 'anual', 'custom')),
  add constraint recurring_incomes_interval_chk    check (interval_months >= 1);

alter table public.recurring_expenses
  add constraint recurring_expenses_periodicity_chk check (periodicity in ('mensal', 'anual', 'custom')),
  add constraint recurring_expenses_interval_chk    check (interval_months >= 1);
