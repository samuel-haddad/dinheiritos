# Roadmap

## Fase 0 — Fundação ✅
- [x] Estrutura do repositório e documentação
- [x] Modelo de dados definido
- [x] Schema aplicado no projeto Supabase estudo-tcdf (ver CLAUDE.md)
- [ ] Usuários de Auth (Samuel, Ivana) criados no painel do Supabase

## Fase 1 — Dados ✅
- [x] Migração dos dados legados (16/07/2026, validada contra a aba `saldo`)
- [ ] Rotina de fechamento de mês via agente (snapshots + faturas)

## Fase 2 — Web app (MVP)
- [x] Scaffold Next.js em `web/` (export estático, Supabase Auth)
- [x] Motor de projeção e alocação (TS puro, 16 testes unitários)
- [x] Dashboard prospectivo: saldo livre por mês (24 meses) + patrimônio
- [x] Tela de metas com progresso e aporte necessário
- [x] Workflow de deploy no GitHub Pages
- [ ] Publicar: criar usuários de Auth, setar variáveis no GitHub e ativar Pages

## Fase 3 — Alocação e gestão
- [x] Motor de alocação v2: aporte mínimo automático + prioridade (fim dos pesos)
- [x] Metas editáveis: CRUD, aportes, prioridade, status e conclusão projetada
- [x] Tema light/dark com identidade da logo; login com Google; glossário
- [x] Telas de cadastro (CRUD): recorrentes, pontuais, previsões, contas+saldos, cartões+faturas, investimentos+posições
- [x] Análises: Receita × Despesa, composição de despesas, aportes, acumulados, tabela saldo (real vs projetado)
- [x] Evolução dos investimentos (total e por pessoa)
- [ ] Métricas de previsto vs realizado, acurácia, taxa de poupança, runway
- [ ] Fluxo "Fechar mês" guiado (um clique para lançar tudo do mês)
- [ ] Redesign visual no Claude Design (backlog)

## Fase 4 — IA Financial Advisor
- [ ] Edge Function: JSON (mês atual + 6 meses projetados) → Anthropic API
- [ ] Alertas de viabilidade e recomendações no dashboard

## Fase 5 — Revisão de telas (jul/2026)

Backlog levantado por Samuel. Itens marcados **decisão** dependem de uma escolha antes de implementar.

### 5.0 Saneamento das bases derivadas (fazer primeiro)
Auditar e ajustar (recalcular, apagar ou atualizar) todas as bases que guardam **projeções e dados de cálculo futuro**. **Fontes de verdade — não tocar:** Lançamentos (`recurring_incomes`, `recurring_expenses`, `one_off_incomes`, `planned_expenses`), Contas (`accounts`, `account_snapshots`), Cartões (`credit_cards`, `card_bills`), Investimentos (`investments`, `investment_snapshots`) e, em Metas, apenas os campos **meta (`name`), valor alvo (`target_amount`), prazo (`deadline`) e responsável (`profile_id`)**. Todo o resto é derivado e pode ser reconstruído.
- [ ] **`monthly_projections`** — hoje 10 linhas, todas `is_closed` (2025-09→2026-06); nenhum mês futuro cacheado. É "sempre reconstituível pelo motor" (`docs/PROJECTION_ENGINE.md` §4). Validar cada linha fechada contra o motor e definir a política: guardar só histórico fechado ou também cachear futuros (e, nesse caso, rotina de recálculo).
- [ ] **`goal_contributions`** — hoje 3 linhas (jul/2026). No novo modelo de Metas (5.3), a posição passa a vir do saldo real (contas + investimentos), tornando os aportes registrados redundantes. **Decisão:** limpar a tabela, mantê-la como histórico ou depreciá-la via migration.
- [ ] **Colunas derivadas/legadas de `goals`** — `weight` (legado, migration 0002, não usado) e `achieved` (passa a ser calculado, item 3.5) podem ser saneadas/depreciadas. **Nota:** `priority`, `paused` e `start_month` são entradas manuais (não cálculos) — preservar salvo decisão em contrário.
- [ ] Confirmar **antes de qualquer DELETE** (regra do `docs/DATA_INGESTION.md`).

### 5.1 Lançamentos (`web/app/lancamentos/page.tsx`)
- [x] **Toggle "Ativas / Desativadas"** filtrando os registros em todas as abas. Default: Ativas. Implementado: toggle global na página `lancamentos`, `rowFilter` no `EntityManager` e componente `Toggle`.
  - **Decisão tomada:** adicionada coluna `active` a `one_off_incomes` e `planned_expenses` (migration `0003_active_columns.sql`) para comportamento uniforme.
- [x] **Periodicidade** para receitas e despesas recorrentes: `mensal | anual | customizada`. **Decisão tomada:** dois campos (`periodicity` + `interval_months`, migration `0004`); previsões **não** recebem periodicidade (seguem parceladas mês a mês).
  - Motor (`projection.ts`): recorrente ocorre quando `diffMonths(start, M) % interval_months == 0` (helper `occurs`). +2 testes em `projection.test.ts` (24 no total). Docs `PROJECTION_ENGINE.md` e `DATA_MODEL.md` atualizados.
  - Formulários em `lancamentos/page.tsx`: select de periodicidade + intervalo (só p/ Customizada), com `normalizePeriodicity` no `beforeSave`.
  - **Ganho colateral (5.5):** agora dá para re-cadastrar 13º/férias como recorrentes **anuais** — eles voltam a aparecer em 2027+ e o patrimônio deixa de "estabilizar".

### 5.2 Cartões (`web/app/cartoes/page.tsx`)
- [x] **Ordenar faturas da menor para a maior data:** `billConfig` agora usa `ascending: true`.
- [x] **Toggle "Em aberto"** (default ligado) filtrando faturas do mês corrente em diante, via `rowFilter` do `EntityManager` + `Toggle` na página `cartoes`.

### 5.3 Metas (`web/app/metas/page.tsx`, `web/lib/engine/allocation.ts`)
Mudança conceitual: a posição da meta deixa de vir de aportes registrados e passa a ser derivada do saldo real (contas + investimentos).
- [ ] **Posição atual = saldo em contas + investimentos**, distribuído entre as metas. Hoje `current = Σ goal_contributions` (`allocation.ts`); passar a alocar o `currentNetWorth(data)` entre as metas.
  - **Decisão (fundamental):** qual a regra de distribuição do patrimônio atual entre as metas? (ex.: cascata por prioridade/prazo, como já é feito com o saldo livre; ou proporcional ao alvo). Define todo o resto do bloco.
- [ ] **Teto na posição:** posição nunca > alvo; excedente cascateia para as demais metas (mesma lógica de "excedente" já existente em `allocation.ts` §2). Ajustar as bases de dados se preciso.
- [ ] **Remover botão "+ Aporte"** (`GoalCard`) e o `ContributionDialog`. Sem aportes manuais, `goal_contributions` fica órfã — decidir manter (histórico) ou depreciar via migration.
- [ ] **Viabilidade da nova meta:** ao cadastrar, rodar `planGoals` com a meta prospectiva e mostrar o status (no prazo / vai atrasar / inviável) antes de salvar. O `GoalDialog` já traz simulador de AM — estender.
- [ ] **Remover checkbox "Alcançada"** (`GoalDialog`) — alcance passa a ser calculado (posição ≥ alvo). Ajustar `isActive`/`health` em `allocation.ts` para derivar `achieved` da posição; avaliar depreciar a coluna `goals.achieved`.

### 5.4 Análises (`web/app/analises/page.tsx`)
- [x] **Composição das despesas:** duas colunas por mês — Receitas (barra única) e Despesas (`stackId` próprio, empilhando Recorrentes + Faturas + Parcelas). **Decisão tomada:** Despesas soma o total (recorrentes incluídas).
- [x] **Aportes:** barras empilhadas por meta (via `plan.monthly[].perGoal`), com highlight ao clicar na barra ou na legenda (estado `focus`), cobrindo todo o período do gráfico. Estado vazio quando não há aportes sugeridos.
- [x] **Acumulados:** séries aportes acumulados, previsões acumuladas e despesas acumuladas (substituem saldo/aportes acumulados). Glossário de "Acumulados" atualizado.

### 5.5 Projeção / Dashboard (`web/app/page.tsx`)
- [x] **Saldo livre projetado (24m):** `ComposedChart` com as barras mensais (eixo esquerdo) + linha de **saldo livre acumulado** (eixo direito) chegando ao total no fim do período. Glossário de "Saldo livre" atualizado.
- [x] **Patrimônio "estabilizando" — investigado: não é bug de gráfico nem de fórmula.** O gráfico e a fórmula `netWorth(M) = netWorth(M−1) + saldo_livre(M)` estão corretos. A curva achata (na verdade cai ~R$160/mês) a partir de mar/2027 porque o **saldo livre projetado cai a ≈ 0** ali. Duas causas, ambas nos dados/modelo — não no código:
  - Rendas anuais (13º Ivana R$25.800, 13º Samuel R$22.499, férias, restituição ≈ R$91k no total) estão como **pontuais só em 2026** e não se repetem → a renda de 2027+ é só a recorrente mensal (R$56.919). **A periodicidade anual do item 5.1 corrige isto.**
  - De mar/2027 a projeção volta todo cartão ao `base_amount` (R$17.500/mês somados) porque as faturas reais vão só até fev/2027; somado à despesa recorrente "Gastos cartão" (R$8.000), o gasto de cartão parece **duplicado/superestimado**. **Revisar `base_amount` dos cartões vs. "Gastos cartão".**
  - Ação: não é correção de gráfico — tratar via 5.1 (periodicidade anual) + revisão dos dados de cartão.

### 5.6 Global — tooltip do ⓘ (todas as telas)
- [x] Componente `InfoTip` (`web/components/InfoTip.tsx`): mostra a(s) definição(ões) em **texto flutuante no hover** e, ao clicar, leva ao glossário com a definição **centralizada**. Suporta múltiplas métricas por ⓘ.
  - `entries` extraídas para `web/lib/glossary.ts` (fonte única de glossário e tooltips).
  - Glossário centraliza a âncora via `scrollIntoView({ block: 'center' })` + destaque temporário; `scroll-mt-[40vh]`.
  - Aplicado no dashboard (KPIs e cards) e em Análises (por aba). Pronto para espalhar às demais telas.
