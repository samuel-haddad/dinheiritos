-- 0011_day_of_month_fields.sql
-- Fluxo de caixa diário (Resumo Mensal): dia do mês em que cada lançamento ocorre.
--
-- Levantamento do que já tinha o dia e do que faltava:
--   recurring_incomes.receipt_day   já existe (migration 0001)
--   one_off_incomes.expected_date   já é date completa (tem o dia)
--   credit_cards.due_day            já existe (migration 0001) — usado também
--                                    como dia da despesa em card_bills, que só
--                                    guarda o mês de vencimento
--   recurring_expenses               NÃO tinha dia → payment_day (este arquivo)
--   planned_expenses (parcelas)      NÃO tinha dia → due_day (este arquivo)

alter table public.recurring_expenses
  add column if not exists payment_day int check (payment_day between 1 and 31);

alter table public.planned_expenses
  add column if not exists due_day int check (due_day between 1 and 31);
