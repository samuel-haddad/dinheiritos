-- 0008_approved_users_access_gate.sql
-- Restringe o acesso aos dados a contas aprovadas.
--
-- Problema: as policies RLS de todas as tabelas eram `to authenticated using (true)`,
-- ou seja, qualquer pessoa que criasse uma conta (signup por e-mail/senha ou primeiro
-- login com Google) ganhava acesso total de leitura/escrita aos dados financeiros do
-- casal. O login em si continua liberado (não há tela de cadastro dedicada e o botão
-- "Entrar com Google" provisiona conta automaticamente no primeiro acesso) — mas agora
-- o ACESSO AOS DADOS exige aprovação prévia.
--
-- Mecanismo: tabela allowlist `approved_users` (por e-mail, vinculada a auth.users
-- quando possível) + função `is_approved_user()` (security definer, roda com os
-- privilégios do owner e portanto não depende de policy de select em approved_users)
-- usada em todas as policies no lugar de `using (true)`.

-- ========== Allowlist ==========

create table public.approved_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id uuid unique references auth.users(id) on delete set null,
  note text,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.approved_users is
  'Allowlist de acesso ao Dinheiritos. Login (auth.users) continua aberto; leitura/escrita nas tabelas de dados exige um e-mail (ou user_id) aqui presente. Gerenciada manualmente via SQL/agente — não há UI de aprovação no app.';

-- RLS habilitada e sem nenhuma policy: acesso direto à tabela fica bloqueado para
-- `authenticated`/`anon`. A única forma de consultar aprovação é via is_approved_user(),
-- que roda como security definer.
alter table public.approved_users enable row level security;

-- Normaliza e-mail em minúsculas para evitar duplicidade por caixa.
create or replace function public.normalize_approved_user_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(new.email);
  return new;
end;
$$;

create trigger normalize_approved_users_email
  before insert or update of email on public.approved_users
  for each row execute function public.normalize_approved_user_email();

-- Quando uma conta auth.users é criada (ou o e-mail é confirmado/alterado), vincula
-- automaticamente o user_id na allowlist se o e-mail já estiver aprovado.
create or replace function public.link_approved_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.approved_users
    set user_id = new.id
    where lower(email) = lower(new.email)
      and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_approval on auth.users;
create trigger on_auth_user_created_link_approval
  after insert or update of email on auth.users
  for each row execute function public.link_approved_user();

-- Função de checagem usada nas policies. security definer + owner com bypass de RLS
-- (padrão postgres do Supabase) permite ler approved_users mesmo sem policy de select.
create or replace function public.is_approved_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.approved_users au
    where au.user_id = auth.uid()
       or lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant execute on function public.is_approved_user() to authenticated;

-- ========== Atualiza as policies das tabelas de dados ==========
-- Troca "authenticated_all" (using true) por uma policy que exige aprovação.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','recurring_incomes','recurring_expenses','one_off_incomes',
    'planned_expenses','accounts','account_snapshots','credit_cards','card_bills',
    'investments','investment_snapshots','goals','monthly_projections','app_settings'
  ] loop
    execute format('drop policy if exists "authenticated_all" on public.%I', t);
    execute format(
      'create policy "approved_users_all" on public.%I for all to authenticated using (public.is_approved_user()) with check (public.is_approved_user())',
      t
    );
  end loop;
end $$;

-- ========== Seed: contas já aprovadas ==========
-- Samuel, Ivana e a terceira conta já existente em auth.users (revisar depois se
-- necessário — ver approved_users.note).

insert into public.approved_users (email, note) values
  ('samuelhsm@gmail.com', 'Samuel'),
  ('nanadessen@gmail.com', 'Ivana (a confirmar)'),
  ('smachadd@gmail.com', 'conta pré-existente, aprovada por padrão em 2026-07-22 — revisar')
on conflict (email) do nothing;

update public.approved_users au
set user_id = u.id
from auth.users u
where lower(au.email) = lower(u.email)
  and au.user_id is null;
