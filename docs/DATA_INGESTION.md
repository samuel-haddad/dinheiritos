# Ingestão de Dados via Agentes

O Dinheiritos é alimentado conversando com Claude (Cowork ou Claude Code) conectado ao **Supabase MCP**. O app não depende de digitação manual de formulários no dia a dia.

## 1. Fluxos de ingestão

| Quando | Exemplo de pedido ao agente | Tabelas afetadas |
|---|---|---|
| Fechamento do mês | "Fecha junho: BTG 5.321,81; Caixa 9.200; fatura BTG 2.661,49..." | `account_snapshots`, `card_bills`, `investment_snapshots`, `monthly_projections` |
| Nova previsão | "Vamos parcelar a obra do jardim: 10 mil em 3x a partir de outubro, no meu nome" | `planned_expenses` |
| Mudança de renda | "O salário da Ivana subiu para 35 mil a partir de setembro" | `recurring_incomes` (encerra a vigente, cria nova) |
| Nova meta | "Meta nova: trocar o carro, 250 mil até maio/2028" | `goals` (posição e alcance são calculados do patrimônio) |

## 2. Regras para o agente

1. **Meses** sempre como `date` no dia 1 (`2026-07-01` = julho/2026).
2. **Upsert em snapshots**: (`account_id`,`month`) e (`credit_card_id`,`month`) são únicos — atualizar, não duplicar.
3. **Mudança de valor recorrente** = encerrar o registro vigente (`end_month`) + criar novo. Nunca sobrescrever histórico.
4. **Responsável**: todo registro tem `profile_id` (Samuel ou Ivana). Se ambíguo, perguntar.
5. **Valores em BRL**, `numeric(14,2)`. Interpretar "5.321,81" como 5321.81.
6. **Confirmar antes de deletar** qualquer registro.
7. Após fechamento de mês, recalcular `monthly_projections` do mês fechado (`is_closed = true`).

## 3. Migração dos dados legados

Fonte: `data/legacy/old_data.xlsx`. Mapeamento aba → tabela:

| Aba | Destino | Observações |
|---|---|---|
| `receitas_recorrentes` | `recurring_incomes` | "Dia Recebimento" → `receipt_day` |
| `despesas_recorrentes` | `recurring_expenses` | "Prazo" → `end_month` (null se vazio) |
| `receitas_pontuais` | `one_off_incomes` | datas passadas → `confirmed = true` |
| `previsoes` | `planned_expenses` | "Parcelas"/"Valor da Parcela" → installments |
| `contas` | `accounts` + `account_snapshots` | contas distintas viram `accounts`; cada linha vira snapshot (`chave_ano_mes` → `month`) |
| `cartoes` | `credit_cards` | "Valor base" → `base_amount`; "Dia do Vencimento" → `due_day` |
| `gasto_cartao` | `card_bills` | "Fatura" → `amount`; `chave_ano_mes` → `month` |
| `investimento` | `investments` + `investment_snapshots` | locais distintos viram `investments`; linhas viram snapshots |
| `metas` | `goals` | só colunas de entrada (Meta, Valor, Início, Prazo, Responsável); posição/alcance são calculados |
| `saldo` | `monthly_projections` | meses passados com `is_closed = true`; opcional (recalculável) |
| `reservas`, `icons` | — | descartadas (`icons` já está em `logo_url`) |

Passos: (1) aplicar migration inicial; (2) criar `profiles` de Samuel e Ivana; (3) pedir ao agente que leia a planilha e insira via MCP, aba por aba, na ordem acima; (4) validar totais contra a aba `saldo`.

## 4. Validação pós-migração

- Contagem de linhas por tabela vs. linhas não-vazias da planilha.
- `Σ recurring_incomes` ≈ receita mensal esperada (~56.919 na planilha).
- Recalcular projeção de um mês fechado e comparar com a aba `saldo`.
