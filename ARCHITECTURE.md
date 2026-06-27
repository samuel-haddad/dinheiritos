# Documento de Especificação e Arquitetura - Finanças Pessoais

## 1. Visão Geral e Proposta de Valor
Aplicativo de gestão financeira focado em planejamento de longo prazo, alocação inteligente de saldos e projeção de cenários para o casal (Samuel e Ivana). O sistema atua como um navegador financeiro: consolida o histórico unificado de transações, projeta o fluxo de caixa futuro considerando faturas e previsões, e otimiza a alocação de saldos positivos para atingir metas com prazos definidos.

## 2. Stack Tecnológica
* **Frontend:** Flutter (Web), otimizado para hospedagem no GitHub Pages.
* **Backend & DB:** Supabase (PostgreSQL, Auth, Edge Functions).
* **Design System:** Inspirado no Open Design. Foco em clareza, tipografia moderna e visual analítico (dashboard web), abandonando listas densas e modos escuros pesados.
* **IA Engine:** Anthropic API (Claude 3.5 Sonnet / Opus 4.8) via Supabase Edge Functions.

## 3. Modelo de Dados (PostgreSQL Relacional Otimizado)

O modelo foge da estrutura de planilhas isoladas e centraliza o fluxo financeiro em uma única tabela de transações, facilitando a geração de gráficos evolutivos.

* **`profiles`**: Identificação dos responsáveis (Samuel, Ivana).
* **`accounts`**: Contas correntes e carteiras de investimento (ex: BTG, BB, Santander, Caixa).
* **`categories`**: Mapeamento de categorias de gastos e receitas com ícones correspondentes.
* **`transactions` (Fluxo de Caixa Unificado)**:
    * `id` (uuid, PK)
    * `profile_id` (fk -> profiles)
    * `category_id` (fk -> categories)
    * `description` (text): Ex: "Salário", "Condomínio", "Parcela Ora GT".
    * `amount` (numeric): Valores positivos (receitas) ou negativos (despesas).
    * `date` (date): Data de competência ou pagamento.
    * `payment_method` (enum): 'account' ou 'credit_card'.
    * `account_id` (fk -> accounts, nullable).
    * `credit_card_id` (fk -> credit_cards, nullable).
    * `credit_card_bill_id` (fk -> credit_card_bills, nullable).
    * `is_recurring` (boolean): Flag para despesas/receitas fixas.
    * `recurrence_period` (enum, nullable): 'monthly', 'yearly'.
* **`credit_cards`**:
    * `id` (uuid, PK)
    * `profile_id` (fk -> profiles)
    * `name` (text)
    * `closing_day` (int), `due_day` (int).
    * `projected_base_value` (numeric): Valor base assumido para meses futuros em que a fatura ainda não tem lançamentos.
* **`credit_card_bills`**:
    * `id` (uuid, PK)
    * `credit_card_id` (fk -> credit_cards)
    * `billing_month` (date).
    * `status` (enum): 'open', 'closed', 'paid'.
* **`installments`**: Controle de compras parceladas, gerando vínculos com transações futuras nas faturas.
* **`investments`**:
    * `id` (uuid, PK), `profile_id` (fk), `type` (Renda Fixa, Variável, Fundos), `current_balance`, `last_updated`.
* **`goals` (Metas com Prazo)**:
    * `id` (uuid, PK), `profile_id` (fk).
    * `name` (text): Ex: "Viagem China".
    * `target_amount` (numeric), `current_amount` (numeric).
    * `deadline` (date).
* **`forecasts` (Previsões Futuras)**:
    * `id` (uuid, PK), `name` (text), `expected_amount` (numeric), `expected_date` (date).
    * `is_installment_plan` (boolean), `number_of_installments` (int).
    * `is_confirmed` (boolean): Flag que indica se a previsão já virou uma transação real.
* **`monthly_balances`**: Tabela de snapshot para cache e renderização rápida de gráficos. Salva o saldo total de receitas, despesas, investimentos e o saldo livre de cada mês fechado.

## 4. Épicos Funcionais

1.  **Dashboard Prospetivo:** O painel principal cruza a linha de saldo acumulado projetado (próximos 24 meses) com a linha alvo de metas, renderizando barras de saldo livre (Receitas - Despesas Fixas - Faturas - Previsões).
2.  **Motor de Alocação:** Algoritmo que calcula o saldo livre do mês corrente e sugere a distribuição ótima desse valor diretamente para as `goals`, baseando-se na urgência do `deadline`.
3.  **IA Financial Advisor:** Função disparada via Supabase Edge Functions. Consolida um JSON do mês atual + 6 meses de projeção e envia ao LLM. A IA devolve alertas de viabilidade do fluxo de caixa e recomendações estratégicas sobre os saldos projetados.