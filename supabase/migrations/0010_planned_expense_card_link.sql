-- 0010_planned_expense_card_link.sql
-- Previsões (planned_expenses) podem ser vinculadas a um cartão: quando a fatura do
-- mês já foi lançada (card_bills), a parcela daquele mês some do cálculo (o gasto já
-- está refletido na fatura real) — evita contar em dobro. Sem fatura lançada, a parcela
-- soma normalmente (mesmo comportamento de hoje). Ver docs/PROJECTION_ENGINE.md §1.

alter table public.planned_expenses
  add column if not exists is_card_expense boolean not null default false,
  add column if not exists credit_card_id  uuid references public.credit_cards(id);

alter table public.planned_expenses
  add constraint planned_expenses_card_chk
    check (not is_card_expense or credit_card_id is not null);
