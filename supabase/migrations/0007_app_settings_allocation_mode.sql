-- 0007_app_settings_allocation_mode.sql
-- Preferências globais do app (uma linha, compartilhada por Samuel e Ivana).
-- allocation_mode controla como o saldo livre e o patrimônio são distribuídos
-- entre as metas (docs/PROJECTION_ENGINE.md §2):
--   'am'       → Aporte Mínimo autoajustável (comportamento anterior; default).
--   'priority' → todo o saldo livre vai para a meta de maior prioridade até 100%,
--                depois cascateia para a próxima (menor priority = mais prioritária).
create table public.app_settings (
  -- singleton: id só pode ser true, garantindo no máximo uma linha
  id boolean primary key default true check (id),
  allocation_mode text not null default 'am' check (allocation_mode in ('am', 'priority')),
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is
  'Preferências globais do Dinheiritos (linha única). Compartilhada entre os perfis.';
comment on column public.app_settings.allocation_mode is
  '''am'' (Aporte Mínimo autoajustável) ou ''priority'' (cascata por prioridade). Default ''am'' preserva o comportamento anterior.';

-- Linha única inicial no modo padrão.
insert into public.app_settings (id, allocation_mode) values (true, 'am')
  on conflict (id) do nothing;

-- RLS: mesmo padrão das demais tabelas (authenticated pode tudo).
alter table public.app_settings enable row level security;
create policy "authenticated_all" on public.app_settings
  for all to authenticated using (true) with check (true);
