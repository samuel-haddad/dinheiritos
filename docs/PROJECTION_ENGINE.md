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

**Patrimônio** — para meses passados/atual, soma dos últimos snapshots de contas + investimentos. Para meses futuros:

```
net_worth(M) = net_worth(M−1) + free_balance(M)
```

## 2. Motor de alocação de metas (v2 — sem pesos)

> Os pesos foram descontinuados (migration 0002). `goals.weight` é coluna legada.
> A alocação é automática: o prazo de cada meta já codifica a necessidade de caixa.

**Aporte mínimo autoajustável (AM):**

```
AM(meta, M) = faltante(meta, M) / max(1, meses até o deadline)
faltante = target_amount − Σ goal_contributions
```

Recalculado a cada mês da simulação: sub-aportes num mês elevam o AM dos seguintes.

**Distribuição do saldo livre de cada mês simulado:**

1. Toda meta ativa (não alcançada, não pausada) recebe seu AM.
2. **Excedente** → meta de prazo mais próximo (teto no faltante; cascata para a próxima). Concluir a meta urgente antes libera caixa para as demais.
3. **Déficit** (saldo < Σ AMs) → financia na ordem de `goals.priority` (menor primeiro; empate: prazo mais próximo). Prioridade é a única decisão manual do usuário, e só importa neste caso.

**Simulação e status:** a simulação roda até o último prazo ativo (cap 300 meses) sobre a série de saldos livres projetados, e produz por meta: conclusão projetada e status — `on_track` (conclui até o prazo), `late` (conclui depois), `infeasible` (não conclui no horizonte), `paused`, `achieved`. Se a simulação por prazo-mais-próximo não cumpre os prazos, nenhuma distribuição cumpre (otimalidade EDF) — o alerta de inviabilidade é exato, não heurístico.

Aportes efetivados são gravados em `goal_contributions`; a simulação usa alocações sugeridas apenas para meses futuros.

## 3. Fechamento de mês

Ao virar o mês (ação manual ou via agente):

1. Registrar snapshots de contas e investimentos (`account_snapshots`, `investment_snapshots`).
2. Registrar faturas fechadas em `card_bills`.
3. Confirmar `one_off_incomes` e parcelas ocorridas.
4. Registrar aportes reais em `goal_contributions`.
5. Recalcular e gravar `monthly_projections` com `is_closed = true`.

## 4. Invariantes

- O motor nunca grava no banco; quem persiste é a camada de fechamento.
- `monthly_projections` é sempre reconstituível a partir das demais tabelas.
- Valores monetários em `numeric`; nada de float no banco.
- Horizonte padrão: mês atual + 24 meses.
