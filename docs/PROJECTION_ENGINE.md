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
            + Σ parcelas de planned_expenses com M ∈ [start_month, end_month)
            + Σ fatura(cartão, M) para cada cartão ativo
```

**Regra da fatura:** se existe `card_bills` para (cartão, M), usa o valor real; senão usa `credit_cards.base_amount`. Isso permite projetar meses futuros antes das faturas fecharem.

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
continuam competindo por aporte mínimo e excedente exatamente como metas `patrimonio`. O
ajuste é só uma leitura sobre o resultado, feita por `projectedWealth` (`lib/engine/allocation.ts`).
Metas `gasto` pausadas não entram no desconto (mesma regra de pausa do resto do motor).
Meses fechados (`monthly_projections.is_closed = true`) guardam o patrimônio real observado
e não passam por este ajuste.

## 2. Motor de alocação de metas (v2 — sem pesos, sem aportes manuais)

> Sem pesos (removidos na migration 0005) e sem aportes manuais. A **posição atual** de
> cada meta é derivada do patrimônio; o prazo codifica a necessidade de caixa.

**Posição atual (5.3):** `distributeNetWorth` reparte o patrimônio (contas + investimentos)
entre as metas ativas na ordem de **prazo mais próximo** (empate por prioridade), com **teto
no valor-alvo** — o excedente **cascateia** para a próxima meta. Metas pausadas não recebem
posição. O **alcance** é calculado: posição ≥ alvo ⇒ `achieved`.

**Aporte mínimo autoajustável (AM):**

```
AM(meta, M) = faltante(meta, M) / max(1, meses até o deadline)
faltante = target_amount − posição(meta)
```

Recalculado a cada mês da simulação: sub-aportes num mês elevam o AM dos seguintes.

**Distribuição do saldo livre de cada mês simulado:**

1. Toda meta ativa (não alcançada, não pausada) recebe seu AM.
2. **Excedente** → meta de prazo mais próximo (teto no faltante; cascata para a próxima). Concluir a meta urgente antes libera caixa para as demais.
3. **Déficit** (saldo < Σ AMs) → financia na ordem de `goals.priority` (menor primeiro; empate: prazo mais próximo). Prioridade é a única decisão manual do usuário, e só importa neste caso.

**Simulação e status:** a simulação roda até o último prazo ativo (cap 300 meses) sobre a série de saldos livres projetados, e produz por meta: conclusão projetada e status — `on_track` (conclui até o prazo), `late` (conclui depois), `infeasible` (não conclui no horizonte), `paused`, `achieved`. Se a simulação por prazo-mais-próximo não cumpre os prazos, nenhuma distribuição cumpre (otimalidade EDF) — o alerta de inviabilidade é exato, não heurístico.

A simulação usa alocações sugeridas apenas para meses futuros; não há aportes manuais persistidos.

## 3. Fechamento de mês

Ao virar o mês (ação manual ou via agente):

1. Registrar snapshots de contas e investimentos (`account_snapshots`, `investment_snapshots`).
2. Registrar faturas fechadas em `card_bills`.
3. Confirmar `one_off_incomes` e parcelas ocorridas.
4. Recalcular e gravar `monthly_projections` com `is_closed = true`.

(A posição das metas vem dos snapshots do passo 1 — não há aportes a registrar.)

## 4. Invariantes

- O motor nunca grava no banco; quem persiste é a camada de fechamento.
- `monthly_projections` guarda só meses fechados (histórico); os futuros nunca são cacheados — o motor os reconstitui no cliente. (Meses legados anteriores a 2026-07 não são recomputáveis pelos insumos atuais.)
- Valores monetários em `numeric`; nada de float no banco.
- Horizonte padrão: mês atual + 24 meses.
