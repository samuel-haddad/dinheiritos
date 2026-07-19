-- 0005_goals_derived_position.sql
-- Fase 5.3 — a posição das metas passa a ser DERIVADA do patrimônio (contas +
-- investimentos), distribuída por prazo com teto no alvo. Não há mais aportes
-- manuais nem flag de "alcançada" (o alcance é calculado).
--   * goal_contributions: descontinuada.
--   * goals.weight: legado da migration 0002, nunca usado.
--   * goals.achieved: agora calculado (posição ≥ alvo).
drop table if exists public.goal_contributions;

alter table public.goals drop column if exists weight;
alter table public.goals drop column if exists achieved;
