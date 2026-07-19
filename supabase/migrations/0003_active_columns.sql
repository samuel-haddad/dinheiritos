-- 0003_active_columns.sql
-- Fase 5.1.1 — toggle "Ativas / Desativadas" em Lançamentos.
-- Receitas pontuais e previsões não tinham a coluna `active` (só `confirmed`).
-- Adiciona `active` para comportamento uniforme com as recorrentes.
alter table public.one_off_incomes  add column if not exists active boolean not null default true;
alter table public.planned_expenses add column if not exists active boolean not null default true;
