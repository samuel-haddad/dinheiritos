-- Metas v2: fim dos pesos como mecanismo de alocação.
-- A alocação passa a ser automática (aporte mínimo por prazo); `priority`
-- é usada apenas para desempate quando o saldo do mês não cobre todos os
-- aportes mínimos. `weight` fica como coluna legada (não usada pelo app).

alter table goals add column priority int not null default 100;
alter table goals add column paused boolean not null default false;

-- Peso 0 na planilha significava "meta pausada"
update goals set paused = true where weight = 0;

-- Prioridade inicial: ordem de prazo (mais próximo = mais prioritário)
with ranked as (
  select id, row_number() over (order by deadline asc) as rn from goals
)
update goals g set priority = r.rn from ranked r where g.id = r.id;

comment on column goals.weight is 'LEGADO: não usado desde a migration 0002. Alocação é automática por aporte mínimo.';
comment on column goals.priority is 'Ordem de desempate quando o saldo livre não cobre todos os aportes mínimos (menor = mais prioritária).';
