# Agente de Ingestão — print, texto e tabela

Transformar um **print** (foto/screenshot do app do banco ou corretora), **texto** colado
ou **tabela** em upserts de snapshots e faturas no Supabase (projeto **estudo-tcdf**,
`wlogwtbfxnomuakklrpy`), seguindo as regras de `docs/DATA_INGESTION.md`.

Não existe evento de "fechar mês": manter esses dados em dia é tudo — o histórico "real"
é derivado on-the-fly no app (`docs/PROJECTION_ENGINE.md` §3).

**Autonomia: gravar e reportar.** Extrair → gravar os upserts → mostrar o resumo. Só param
para **perguntar antes**: (a) DELETE (regra 6) e (b) perfil ou entidade **ambíguos** (regra 4).
Nunca escrever em `monthly_projections`; nunca tocar nas tabelas do outro app (`modulo`,
`licao`, …).

## 0. Fluxo

1. **Ler** o input: print → leitura visual; texto/tabela → parse.
2. **Casar** cada linha com uma entidade do mapa (§3) → `id` + `profile_id`.
3. **Mês de referência** (§2).
4. **Interpretar valores** em formato BR (§4).
5. **Gravar** os upserts (§5) via `execute_sql` (Supabase MCP).
6. **Reportar** (§6).

## 1. O que cada input vira

| Input | Tabela | Campos |
|---|---|---|
| Saldo de conta corrente | `account_snapshots` | `account_id`, `month`, `balance`, `measured_at` |
| Posição de investimento | `investment_snapshots` | `investment_id`, `month`, `balance`, `measured_at` |
| Fatura de cartão | `card_bills` | `credit_card_id`, `month` (vencimento), `amount` |

Mudança de renda/despesa recorrente, nova previsão ou nova meta **não** são o foco deste
runbook — ver `docs/DATA_INGESTION.md` (regra 3: encerrar vigente + criar novo).

## 2. Mês de referência (`month` = `date` no dia 1)

- **Contas e investimentos:** o mês a que o saldo se refere. Se o usuário disser "saldos de
  junho" → `2026-06-01`. Se mandar o print sem dizer e for a posição **atual** → mês corrente.
  `measured_at` = data da medição (hoje, ou a data que aparecer no print).
- **Faturas:** `month` = **mês de vencimento** da fatura (dia 1). Uma fatura que vence em
  10/08/2026 → `2026-08-01`.
- Único por (entidade, mês): sempre **upsert**, nunca duplicar.
- Na dúvida sobre qual mês, **perguntar** (não chutar).

## 3. Mapa de entidades

> Gerado em 2026-07-21. Regenerar com a query no fim desta seção quando contas/cartões mudarem.

Perfis: **Samuel** `e0bde878-32b5-59b2-8f55-e0c150ea5422` · **Ivana** `fe5ad63e-3896-5ed0-bac1-9b80dfeda108`.

### Contas (`accounts`)

| Perfil | Nome | account_id |
|---|---|---|
| Ivana | BB | `4330db1f-f8cf-573a-a583-457d5ff2ff68` |
| Ivana | Caixa | `f4e44e1a-089e-57bd-a126-da2dd65a936d` |
| Ivana | Revolut | `f6a38fb9-8911-528a-ab02-6727fb946831` |
| Ivana | Santander | `af243fb2-b7ec-5e5e-878a-8e6dbf25bfb3` |
| Samuel | BTG | `ea8eb1a1-29c9-5045-80a5-e2112699fc09` |
| Samuel | Revolut | `88d7733c-37c1-59e3-b0ef-c9086f5c99e3` |

### Cartões (`credit_cards`)

| Perfil | Nome | credit_card_id | Vencimento |
|---|---|---|---|
| Ivana | AA - Santander | `f1316527-7ee2-51bb-bfe5-2b58d9985cd6` | 10 |
| Ivana | Azul - Itau | `5fc0e7c5-4be8-5c7a-ad15-30c49eca4a83` | 23 |
| Ivana | Elo | `8957497d-bc33-5a2f-b8dd-e8eab1b745fa` | 10 |
| Ivana | Revolut | `ea4db484-6ef7-5cd9-a01f-e713a0803f80` | 21 |
| Ivana | Unq - Santander | `78c9603b-d88f-59e0-a565-34dcb08fece3` | 21 |
| Samuel | BTG | `986fc95f-9315-5bac-a31a-e812168e9cf0` | 13 |

### Investimentos (`investments`) — todos BTG

| Perfil | Nome | investment_id |
|---|---|---|
| Ivana | Conta investimento BTG | `49f0cf35-c741-5b0e-8409-bea8ded4cddb` |
| Ivana | Fundos de Investimento | `1fd738bd-71a3-5dc1-a288-985052ff3ac0` |
| Ivana | Renda Fixa | `fffb2e9b-0c7d-5f70-ba0a-a96c7e428514` |
| Ivana | Renda Variável | `9e1646ba-cdfb-5ed9-b767-1058faa496ce` |
| Samuel | Conta investimento BTG | `1ef57c5b-4e5e-54b6-80a8-aa1797e66a9f` |
| Samuel | Fundos de Investimento | `94731bad-c082-5921-989c-4a7eb85a7805` |
| Samuel | Renda Fixa | `786c0695-e715-51e9-82cb-baf930cc6164` |
| Samuel | Renda Variável | `a7ea7339-a7fb-5550-a5bb-16a4338567d1` |

### Ambiguidades a vigiar (sempre perguntar o perfil se o print não deixar claro)

- **"Revolut"** existe como **conta da Ivana**, **conta do Samuel** e **cartão da Ivana**.
  Desambiguar por perfil + tipo (saldo de conta vs fatura de cartão).
- **"Santander"**, **"BTG"** aparecem em conta **e** cartão — distinguir pelo tipo do print
  (saldo vs fatura).
- Dois perfis têm "Conta investimento BTG", "Renda Fixa", etc. — o perfil é obrigatório.

### Regenerar o mapa

```sql
select p.name profile, a.id, a.name from accounts a join profiles p on p.id=a.profile_id where a.active order by 1,3;
select p.name profile, c.id, c.name, c.due_day from credit_cards c join profiles p on p.id=c.profile_id where c.active order by 1,3;
select p.name profile, i.id, i.name from investments i join profiles p on p.id=i.profile_id where i.active order by 1,3;
```

## 4. Valores em formato brasileiro

`"5.321,81"` → `5321.81`. Remover `R$` e pontos de milhar; vírgula é o separador decimal.
Negativos: sinal `-` ou `(parênteses)` → valor negativo. Ignorar textos como "saldo",
"disponível". Nunca usar float no banco — o Postgres guarda `numeric(14,2)`.

## 5. Upserts (templates)

Chaves únicas confirmadas: `account_snapshots(account_id,month)`,
`investment_snapshots(investment_id,month)`, `card_bills(credit_card_id,month)`.

```sql
-- Saldo de conta
insert into account_snapshots (account_id, month, balance, measured_at)
values ('<account_id>', '<YYYY-MM-01>', <valor>, '<YYYY-MM-DD>')
on conflict (account_id, month)
do update set balance = excluded.balance, measured_at = excluded.measured_at;

-- Posição de investimento
insert into investment_snapshots (investment_id, month, balance, measured_at)
values ('<investment_id>', '<YYYY-MM-01>', <valor>, '<YYYY-MM-DD>')
on conflict (investment_id, month)
do update set balance = excluded.balance, measured_at = excluded.measured_at;

-- Fatura de cartão (month = vencimento, dia 1)
insert into card_bills (credit_card_id, month, amount)
values ('<credit_card_id>', '<YYYY-MM-01>', <valor>)
on conflict (credit_card_id, month)
do update set amount = excluded.amount;
```

Para vários itens do mesmo tipo, empilhar as `values (...)`. Antes de gravar, ler o valor
anterior (`select` por entidade+mês) para poder mostrar o "antes → depois" no report.

## 6. Report (após gravar)

Mostrar uma tabela do que foi gravado:

| Entidade | Perfil | Mês | Anterior | Novo | Ação |
|---|---|---|---|---|---|

E, ao final, listar em separado o que **não** foi gravado por ambiguidade/dúvida, com a
pergunta objetiva para resolver. Ex.: "O print diz 'Revolut 3.210,00' mas não diz de quem —
conta da Ivana ou do Samuel?".

## 7. Nunca

- Não escrever em `monthly_projections` (histórico é derivado — `PROJECTION_ENGINE.md` §3).
- Não tocar nas tabelas do outro app no mesmo schema (`modulo`, `licao`, …).
- Não deletar sem confirmar (regra 6).
- Não gravar com perfil/entidade ambíguos — perguntar primeiro (regra 4).
