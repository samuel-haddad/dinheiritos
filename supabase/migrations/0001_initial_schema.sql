-- Dinheiritos — schema inicial
-- Planejamento e projeção financeira: estimativas + snapshots + metas.
-- Sem tabela de transações (ver ARCHITECTURE.md, decisão D1).

-- ========== Identidade ==========

create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,
  user_id uuid references auth.users(id), -- vínculo opcional com o login
  created_at timestamptz not null default now()
);

-- ========== Estimativas ==========

create table recurring_incomes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  name text not null,
  amount numeric(14,2) not null,
  receipt_day int check (receipt_day between 1 and 31),
  start_month date not null default date_trunc('month', now()),
  end_month date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  name text not null,
  amount numeric(14,2) not null,
  start_month date not null default date_trunc('month', now()),
  end_month date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table one_off_incomes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  name text not null,
  amount numeric(14,2) not null,
  expected_date date not null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table planned_expenses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  name text not null,
  total_amount numeric(14,2) not null,
  installments int not null default 1 check (installments >= 1),
  installment_amount numeric(14,2) not null,
  start_month date not null,
  end_month date not null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ========== Observações (snapshots) ==========

create table accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  name text not null,
  institution text,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table account_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  month date not null,
  balance numeric(14,2) not null,
  measured_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (account_id, month)
);

create table credit_cards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  name text not null,
  due_day int check (due_day between 1 and 31),
  base_amount numeric(14,2) not null default 0,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table card_bills (
  id uuid primary key default gen_random_uuid(),
  credit_card_id uuid not null references credit_cards(id),
  month date not null,
  amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique (credit_card_id, month)
);

create table investments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  name text not null,
  institution text,
  type text check (type in ('renda_fixa','renda_variavel','fundos','conta')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table investment_snapshots (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references investments(id),
  month date not null,
  balance numeric(14,2) not null,
  measured_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (investment_id, month)
);

-- ========== Metas ==========

create table goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  name text not null,
  target_amount numeric(14,2) not null,
  weight numeric(5,4) not null default 0 check (weight >= 0),
  start_month date not null,
  deadline date not null,
  achieved boolean not null default false,
  created_at timestamptz not null default now()
);

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id),
  month date not null,
  amount numeric(14,2) not null,
  note text,
  created_at timestamptz not null default now()
);

-- ========== Projeção (cache) ==========

create table monthly_projections (
  id uuid primary key default gen_random_uuid(),
  month date not null unique,
  total_income numeric(14,2) not null default 0,
  total_expenses numeric(14,2) not null default 0,
  free_balance numeric(14,2) not null default 0,
  goal_allocation numeric(14,2) not null default 0,
  net_worth numeric(14,2) not null default 0,
  is_closed boolean not null default false,
  computed_at timestamptz not null default now()
);

-- ========== RLS ==========
-- Dados compartilhados pelo casal: qualquer usuário autenticado lê e escreve.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','recurring_incomes','recurring_expenses','one_off_incomes',
    'planned_expenses','accounts','account_snapshots','credit_cards','card_bills',
    'investments','investment_snapshots','goals','goal_contributions','monthly_projections'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "authenticated_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
