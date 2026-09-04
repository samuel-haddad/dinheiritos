# Motor de Projeção e Alocação

Função TypeScript pura em `web/` (sem I/O), testável com unit tests. Recebe as estimativas + snapshots e devolve `MonthProjection[]` para um horizonte de 24 meses.

## 1. Projeção de fluxo de caixa

Para cada mês `M` do horizonte:

**Receitas**

```
income(M) = Σ recurring_incomes ativos e que ocorrem em M
          + Σ one_off_incomes com expected_date em M
```

**Periodicidade (recorrentes):** uma receita/despesa recorrente ocorre em M quando
`start_month ≤ M ≤ end_month` **e** `diffMonths(start_month, M) % interval_months == 0`.
Assim `mensal` (interval 1) conta todo mês; `anual` (interval 12) conta a cada 12 meses a
partir do `start_month` (útil p/ 13º, férias); `custom` usa o intervalo informado. Só
recorrentes têm periodicidade — previsões (`planned_expenses`) seguem parceladas mês a mês.

**Despesas**

```
expenses(M) = Σ recurring_expenses ativas em M
            + Σ parcelas de planned_expenses com M ∈ [start_month, end_month), exceto as suprimidas (ver abaixo)
            + Σ fatura(cartão, M) para cada cartão ativo
```

**Regra da fatura:** se existe `card_bills` para (cartão, M), usa o valor real; senão usa `credit_cards.base_amount`. Isso permite projetar meses futuros antes das faturas fecharem.

**Previsão vinculada a cartão (`is_card_expense` + `credit_card_id`, ver `docs/DATA_MODEL.md`):**
uma parcela de `planned_expenses` marcada como despesa de cartão é **suprimida** no mês M
quando já existe `card_bills` para (`credit_card_id`, M) — nesse caso o gasto já está
refletido na fatura real (`cardExpenses` acima), então somar a parcela também dobraria o
valor. Sem fatura lançada para M, a parcela soma normalmente, como qualquer previsão.
Previsões sem `is_card_expense` (o padrão) não são afetadas por esta regra.

**Saldo livre**

```
free_balance(M) = income(M) − expenses(M)
```

**Patrimônio bruto** — para meses passados/atual, soma dos últimos snapshots de contas + investimentos. Para meses futuros:

```
net_worth(M) = net_worth(M−1) + free_balance(M)
```

**Patrimônio Projetado (ajustado)** — o patrimônio bruto acima inclui dinheiro já
comprometido com metas de categoria `gasto` (reforma, viagem — ver `docs/DATA_MODEL.md`),
que não é patrimônio disponível. A métrica exibida no app desconta, mês a mês, o quanto já
está **reservado** para essas metas:

```
reserved(meta, M) = min(target_amount, reserved(meta, M−1) + aporte(meta, M))
reserved(meta, start) = posição inicial da meta (distributeNetWorth, §2)

projected_wealth(M) = net_worth(M) − Σ reserved(meta, M), para toda meta `gasto` não pausada
```

`aporte(meta, M)` vem da simulação de alocação (§2) — a mesma, sem mudanças: metas `gasto`
competem por aporte exatamente como metas `patrimonio`, seja qual for o `allocation_mode`. O
ajuste é só uma leitura sobre o resultado, feita por `projectedWealth` (`lib/engine/allocation.ts`).
Metas `gasto` pausadas não entram no desconto (mesma regra de pausa do resto do motor).
Meses fechados (`monthly_projections.is_closed = true`) guardam o patrimônio real observado
e não passam por este ajuste.

## 2. Motor de alocação de metas (v2 — sem pesos, sem aportes manuais)

> Sem pesos (removidos na migration 0005) e sem aportes manuais. A **posição atual** de
> cada meta é derivada do patrimônio; o prazo codifica a necessidade de caixa.

### Alvo líquido de previsões vinculadas (`goalsWithDeductions`, `lib/engine/allocation.ts`)

Uma previsão (`planned_expenses`) pode ser vinculada a uma meta via `goal_id` (migration
0012). Antes de qualquer outro cálculo deste motor, `goalsWithDeductions(goals,
plannedExpenses)` recalcula o alvo de cada meta:

```
deduzido(meta) = Σ total_amount das previsões ativas com goal_id = meta.id
alvo_líquido(meta) = max(0, target_amount − deduzido(meta))
```

Exemplo: meta "Viagem para China" com `target_amount` 60.000 e uma previsão "Hotéis" de
5.000 vinculada a ela → alvo líquido 55.000. Nada é persistido — `target_amount` na tabela
continua com o valor original; o alvo líquido é recalculado a cada carga a partir das
previsões ativas no momento. Por isso:

- **Apagar ou desativar a previsão devolve o alvo automaticamente** — na próxima carga,
  ela não entra mais na soma.
- **Alvo líquido em 0** faz `remaining = max(0, alvo − posição)` ser sempre 0 (a posição
  nunca é negativa), então a meta cai automaticamente em `health = 'achieved'` em
  `planGoals` — não é preciso marcar nada manualmente.
- Previsões inativas (toggle Ativas/Desativadas em Lançamentos) não deduzem, mesmo com
  `goal_id` preenchido — mesma regra de `active` usada no resto do motor.

Todo o restante deste motor (posição, AM, simulação, status) opera sobre o resultado de
`goalsWithDeductions`, **exceto** o CRUD da própria meta (criar/editar em `/metas`), que lê
e grava sempre o `target_amount` original — senão a dedução ficaria presa no valor editado
e o "devolver ao apagar a previsão" deixaria de funcionar.

### Modo de distribuição (`allocation_mode`, `app_settings`, migration 0007)

O usuário escolhe no topo da tela de Metas **como** o saldo livre e o patrimônio são
distribuídos entre as metas. A escolha é global (linha única de `app_settings`, compartilhada
pelos perfis) e ajusta **todos** os cálculos do app. O parâmetro `mode: AllocationMode`
(`'am' | 'priority'`) é passado a `distributeNetWorth`, `planGoals` e `goalPositionsAt`
(`lib/engine/allocation.ts`). Default `'am'` preserva o comportamento anterior.

**Posição atual (5.3):** `distributeNetWorth` reparte o patrimônio (contas + investimentos)
entre as metas ativas, com **teto no valor-alvo** — o excedente **cascateia** para a próxima
meta. A **ordem** segue o modo: **prazo mais próximo** (empate por prioridade) no modo `am`;
**prioridade** (menor primeiro, empate por prazo) no modo `priority`. Metas pausadas não
recebem posição. O **alcance** é calculado: posição ≥ alvo ⇒ `achieved`.

#### Modo `am` — Aporte Mínimo autoajustável

```
AM(meta, M) = faltante(meta, M) / max(1, meses até o deadline)
faltante = target_amount − posição(meta)
```

Recalculado a cada mês da simulação: sub-aportes num mês elevam o AM dos seguintes.

Distribuição do saldo livre de cada mês simulado:

1. Toda meta ativa (não alcançada, não pausada) recebe seu AM.
2. **Excedente** → meta de prazo mais próximo (teto no faltante; cascata para a próxima). Concluir a meta urgente antes libera caixa para as demais.
3. **Déficit** (saldo < Σ AMs) → financia na ordem de `goals.priority` (menor primeiro; empate: prazo mais próximo). Prioridade só importa neste caso.

Se a simulação por prazo-mais-próximo não cumpre os prazos, nenhuma distribuição cumpre
(otimalidade EDF) — o alerta de inviabilidade é exato, não heurístico.

#### Modo `priority` — Cascata por prioridade

Não há aporte mínimo nem déficit. A cada mês simulado, **todo** o saldo livre (se positivo)
vai para a meta ativa de **maior prioridade** (menor `goals.priority`; empate por prazo) até
completá-la; o **excedente cascateia** para a próxima meta na ordem de prioridade. Metas de
menor prioridade só recebem aporte depois que as mais prioritárias chegam a 100%. O `AM`
continua sendo calculado como **referência** (quanto seria preciso por mês para fechar no
prazo), mas não guia a distribuição.

**Simulação e status (ambos os modos):** a simulação roda até o último prazo ativo (cap 300
meses) sobre a série de saldos livres projetados, e produz por meta: conclusão projetada e
status — `on_track` (conclui até o prazo), `late` (conclui depois), `infeasible` (não conclui
no horizonte), `paused`, `achieved`.

A simulação usa alocações sugeridas apenas para meses futuros; não há aportes manuais persistidos.

## 3. Histórico de meses fechados (não há evento de "fechar mês")

Não existe um evento de fechamento a disparar. Tudo que é **atual ou futuro** já é
recalculado no cliente a cada carga a partir das fontes; e o **"real" dos meses
vencidos** é **derivado on-the-fly**, não cacheado (`web/lib/history.ts`, `deriveHistory`):

- **Meses ∈ [primeira recorrente, mês atual)** — reconstruídos pelo próprio motor
  (`project()`) somado ao **patrimônio observado** dos snapshots (`netWorthAt`: último
  snapshot com `month ≤ M` de cada conta/investimento). A fatura entra real quando existe
  em `card_bills`; senão o `base_amount`. `free_balance = receita − despesa` (estimativa);
  `net_worth` é o real observado. A reconstrução é fiel porque mudanças em recorrentes
  preservam histórico (encerrar vigente + criar novo), então `inRange` usa as datas de época.
- **Meses legados anteriores** (não reconstituíveis: as recorrentes começam em 2026-07) —
  vêm de `monthly_projections` como **semente estática**.

O único trabalho recorrente é **manter snapshots e faturas em dia** — a ingestão que
aconteceria de qualquer forma (`docs/DATA_INGESTION.md`). A posição das metas vem desses
snapshots; aportes de meses fechados não são reconstituíveis (não são persistidos) → 0.

## 5. Fluxo de caixa diário (`dailyCashFlow`, `web/lib/engine/cashflow.ts`)

Enquanto `project()` trabalha em granularidade **mensal**, o fluxo de caixa diário responde
a uma pergunta diferente: **dentro do mês**, existe algum dia em que o saldo em **contas
correntes** (não patrimônio, não investimentos) fica negativo — ou seja, seria necessário
sacar de investimentos para cobrir as despesas daquele mês?

**Dia do mês de cada lançamento** — levantamento (migration 0011):

| Origem | Coluna | Situação |
|---|---|---|
| `recurring_incomes` | `receipt_day` | já existia (migration 0001) |
| `one_off_incomes` | `expected_date` | já é `date` completa, tem o dia |
| `credit_cards` (base e fatura real) | `due_day` | já existia (migration 0001); `card_bills` não tem dia próprio, usa o do cartão |
| `recurring_expenses` | `payment_day` | adicionada na migration 0011 |
| `planned_expenses` (parcelas) | `due_day` | adicionada na migration 0011 |

Sem o dia preenchido, `dailyCashFlow` assume **dia 1** (mesma leitura que a visão mensal já
dava a esses lançamentos, sem regressão). Um dia que não existe no mês em questão — ex.: dia
31 em abril, ou uma receita/despesa recorrente com dia 30 caindo num fevereiro (28 ou 29 dias)
— cai no **último dia do mês** (`clampDay`, `Math.min(dia, diasNoMês)`). Vale para todo campo
de dia do mês (`receipt_day`, `payment_day`, `due_day` de previsão e de cartão), não só para
casos específicos. As mesmas regras de vigência/periodicidade de `project()` (`occurs`,
`inRange`) e a mesma supressão de previsão vinculada a cartão com fatura já lançada
(`suppressedByCardBill`, §1) valem aqui — os dois motores reusam os mesmos helpers para não
divergir.

```
saldo(dia 0) = saldo em contas no início do mês
saldo(dia D) = saldo(dia D−1) + Σ receitas do dia D − Σ despesas do dia D

minBalance   = menor saldo(dia D) do mês
withdrawalNeeded = minBalance < 0
withdrawalAmount = max(0, −minBalance)
withdrawalDate   = primeiro dia em que saldo(dia D) < 0
```

**Saldo de partida do mês** — para o mês atual, o saldo real em contas (último snapshot de
cada conta, sem investimentos — `currentAccountsBalance`, `lib/data.ts`). Para meses futuros,
esse saldo real somado ao `freeBalance` projetado (`project()`) de cada mês entre o atual e o
selecionado — assume que o saldo livre projetado permanece em contas até ser gasto (mesma
simplificação que o resto do app já faz ao acumular `net_worth` a partir do `freeBalance`,
sem modelar transferências para investimento).

Consumida pela tela de Resumo Mensal (`web/app/resumo/page.tsx`), que sinaliza se haverá
retirada de investimentos no mês selecionado, de qual valor e em qual data.

## 6. Invariantes

- O motor nunca grava no banco; é função pura sobre os dados carregados.
- `monthly_projections` **não é mais escrita**: serve só de semente para os meses legados (< primeira recorrente, hoje 2026-07 — não recomputáveis pelos insumos atuais). Os meses fechados reconstituíveis e os futuros são derivados no cliente a cada carga (`deriveHistory` + `project`).
- Valores monetários em `numeric`; nada de float no banco.
- Horizonte padrão: mês atual + 24 meses.
