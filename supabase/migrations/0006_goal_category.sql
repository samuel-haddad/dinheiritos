-- 0006_goal_category.sql
-- Categoria da meta: 'gasto' (compromisso futuro que vai consumir patrimônio,
-- ex.: reforma, viagem) vs 'patrimonio' (construção de patrimônio, ex.: reserva
-- de emergência, previdência). Não muda a alocação/aporte (docs/PROJECTION_ENGINE.md §2),
-- só é usada para o cálculo do Patrimônio Projetado ajustado (§1).
alter table public.goals
  add column category text not null default 'patrimonio'
  check (category in ('gasto', 'patrimonio'));

comment on column public.goals.category is
  '''gasto'' (consome patrimônio ao ser concluída) ou ''patrimonio'' (constrói patrimônio). Default ''patrimonio'' preserva o comportamento anterior.';
