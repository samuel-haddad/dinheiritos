# Modelo de Dados

Postgres (Supabase). Convenções: `id uuid PK default gen_random_uuid()`, `created_at timestamptz default now()`, valores em `numeric(14,2)`, meses de referência como `date` no dia 1 (`month`). Todas as tabelas com RLS `authenticated`.

## Identidade

### `profiles`
Responsáveis (Samuel, Ivana). Vinculado ao `auth.users`.

| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | = auth.users.id |
| name | text | |
| avatar_url | text | |

## Estimativas (entrada do motor de projeção)

### `recurring_incomes` — receitas recorrentes
Ex.: salários, rendimentos. *(planilha: `receitas_recorrentes`)*

| coluna | tipo | notas |
|---|---|---|
| profile_id | uuid FK profiles | |
| name | text | ex.: "Salário Ivana" |
| amount | numeric | mensal |
| receipt_day | int | dia do recebimento |
| start_month | date | default mês atual |
| end_month | date null | null = sem prazo |
| active | boolean | |
| periodicity | text | `mensal` \| `anual` \| `custom` (migration 0004) |
| interval_months | int | meses entre ocorrências: mensal=1, anual=12, custom=N |

### `recurring_expenses` — despesas recorrentes
Ex.: condomínio, financiamento, telefonia. *(planilha: `despesas_recorrentes`)*

| coluna | tipo | notas |
|---|---|---|
| profile_id | uuid FK | |
| name | text | |
| amount | numeric | mensal |
| start_month | date | |
| end_month | date null | "Prazo" da planilha; null = perpétua |
| active | boolean | |
| periodicity | text | `mensal` \| `anual` \| `custom` (migration 0004) |
| interval_months | int | meses entre ocorrências: mensal=1, anual=12, custom=N |

### `one_off_incomes` — receitas pontuais
Ex.: férias, 13º. *(planilha: `receitas_pontuais`)*

| coluna | tipo | notas |
|---|---|---|
| profile_id | uuid FK | |
| name | text | |
| amount | numeric | |
| expected_date | date | |
| confirmed | boolean | já caiu na conta? |
| active | boolean | migration 0003 (toggle Ativas/Desativadas) |

### `planned_expenses` — previsões de despesas (à vista ou parceladas)
Ex.: empréstimo, obra do jardim, 13º de funcionárias. *(planilha: `previsoes`)*

| coluna | tipo | notas |
|---|---|---|
| profile_id | uuid FK | |
| name | text | |
| total_amount | numeric | |
| installments | int | 1 = à vista |
| installment_amount | numeric | total / parcelas |
| start_month | date | primeira parcela |
| end_month | date | gerado: start + installments |
| confirmed | boolean | previsão virou compromisso real? |
| active | boolean | migration 0003 (toggle Ativas/Desativadas) |

## Observações (snapshots mensais)

### `accounts` — contas correntes
*(planilha: `contas` — colunas fixas)*

| coluna | tipo | notas |
|---|---|---|
| profile_id | uuid FK | |
| name | text | ex.: "BTG", "Caixa" |
| institution | text | |
| logo_url | text | |
| active | boolean | |

### `account_snapshots` — saldo por mês
*(planilha: `contas` — linhas mensais)*

| coluna | tipo | notas |
|---|---|---|
| account_id | uuid FK accounts | |
| month | date | dia 1 |
| balance | numeric | |
| measured_at | date | data real da medição |

Único por (`account_id`, `month`).

### `credit_cards`
*(planilha: `cartoes`)*

| coluna | tipo | notas |
|---|---|---|
| profile_id | uuid FK | |
| name | text | ex.: "AA - Santander" |
| due_day | int | vencimento |
| base_amount | numeric | valor assumido p/ meses futuros sem fatura |
| logo_url | text | |
| active | boolean | |

### `card_bills` — fatura fechada por mês
*(planilha: `gasto_cartao`)*

| coluna | tipo | notas |
|---|---|---|
| credit_card_id | uuid FK | |
| month | date | mês de vencimento (dia 1) |
| amount | numeric | total da fatura |

Único por (`credit_card_id`, `month`). Projeção usa `amount` quando existe; senão `base_amount` do cartão.

### `investments`
*(planilha: `investimento` — locais fixos)*

| coluna | tipo | notas |
|---|---|---|
| profile_id | uuid FK | |
| name | text | ex.: "Renda Variável" |
| institution | text | ex.: "BTG" |
| type | text | renda_fixa, renda_variavel, fundos, conta |
| active | boolean | |

### `investment_snapshots` — posição por mês

| coluna | tipo | notas |
|---|---|---|
| investment_id | uuid FK | |
| month | date | |
| balance | numeric | |
| measured_at | date | |

Único por (`investment_id`, `month`).

## Metas

### `goals`
*(planilha: `metas`)*

| coluna | tipo | notas |
|---|---|---|
| profile_id | uuid FK | |
| name | text | ex.: "Viagem para China" |
| target_amount | numeric | |
| priority | int | desempate quando o saldo do mês não cobre todos os aportes mínimos (menor = mais prioritária) |
| paused | boolean | fora da alocação |
| start_month | date | |
| deadline | date | |
| category | text | `gasto` \| `patrimonio` (migration 0006), default `patrimonio` |

Campos calculados (posição atual, faltante, aporte mínimo, status/alcance) **não são colunas**: a posição vem do **patrimônio** (contas + investimentos) distribuído por prazo, com teto no alvo e excedente cascateando (`docs/PROJECTION_ENGINE.md` §2). As colunas `weight` (legada) e `achieved` foram removidas na migration 0005, e a tabela `goal_contributions` foi descontinuada — não há mais aportes manuais.

`category` **não** muda a alocação/aporte (§2 continua igual para as duas categorias) — só é usada no cálculo do Patrimônio Projetado ajustado (`docs/PROJECTION_ENGINE.md` §1): metas `gasto` não pausadas têm o valor já reservado a elas descontado do patrimônio bruto, mês a mês, porque esse valor está comprometido com um gasto futuro e não é patrimônio disponível.

## Acesso

### `approved_users` — allowlist de acesso (migration 0008)
Login continua aberto (e-mail/senha ou Google); o acesso às tabelas de dados exige que o e-mail esteja aqui. Ver `ARCHITECTURE.md` §6 (D6).

| coluna | tipo | notas |
|---|---|---|
| email | text | único, normalizado em minúsculas |
| user_id | uuid FK auth.users | preenchido automaticamente (trigger) quando o e-mail aprovado faz login |
| note | text | quem aprovou / por quê |
| approved_at | timestamptz | |

Sem policy de `select` — só é lida pela função `is_approved_user()` (security definer), chamada via RPC pelo `AuthGate`. Aprovar/revogar é feito por SQL direto (Supabase MCP/Studio), não pelo app.

## Configuração

### `app_settings` — preferências globais (migration 0007)
Linha única (singleton), compartilhada pelos perfis.

| coluna | tipo | notas |
|---|---|---|
| id | boolean PK | sempre `true` (`check (id)`) — garante no máximo uma linha |
| allocation_mode | text | `am` (Aporte Mínimo) \| `priority` (cascata por prioridade). Default `am` |
| updated_at | timestamptz | |

`allocation_mode` controla como o saldo livre e o patrimônio são distribuídos entre as metas
(`docs/PROJECTION_ENGINE.md` §2). Afeta o app inteiro; é passado ao motor de alocação como
`mode`. Gravado por upsert em `id = true` (`setAllocationMode`, `lib/data.ts`).

## Projeção (semente legada)

### `monthly_projections`
*(planilha: `saldo`)* **Não é mais escrita.** O histórico de meses fechados é **derivado on-the-fly** (`web/lib/history.ts`, `deriveHistory`) — não há evento de "fechar mês" (ver `docs/PROJECTION_ENGINE.md` §3). A tabela sobrevive apenas como **semente estática dos meses legados** anteriores à primeira recorrente (2026-07), que não são reconstituíveis pelos insumos atuais. Meses ≥ 2026-07 e futuros são reconstituídos pelo motor a cada carga. O `goal_allocation` dos meses fechados foi zerado no saneamento (5.0) — não há aportes reconstruíveis.

| coluna | tipo | notas |
|---|---|---|
| month | date PK lógico | único |
| total_income | numeric | recorrentes + pontuais |
| total_expenses | numeric | recorrentes + parcelas + faturas |
| free_balance | numeric | income − expenses |
| goal_allocation | numeric | sugerido/realizado p/ metas |
| net_worth | numeric | contas + investimentos |
| is_closed | boolean | mês fechado (dados reais) vs projetado |
| computed_at | timestamptz | |
