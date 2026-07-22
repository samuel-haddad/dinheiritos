# Arquitetura — Dinheiritos

## 1. Visão

App de **planejamento e projeção financeira** do casal. O produto central é a **projeção**: a partir de estimativas (receitas/despesas recorrentes, previsões pontuais, faturas) e snapshots (contas, investimentos), o sistema projeta o fluxo de caixa de 24 meses e sugere a alocação do saldo livre entre metas com prazo.

Não é um app de controle de gastos. Não existe lançamento de transações individuais.

## 2. Decisões de arquitetura

### D1 — Sem tabela `transactions`
A sugestão inicial centralizava tudo numa tabela de transações. Isso foi descartado: o domínio do app são **estimativas e projeções**, não fatos contábeis. O modelo separa:

- **Estimativas** (o que esperamos que aconteça): `recurring_incomes`, `recurring_expenses`, `one_off_incomes`, `planned_expenses`.
- **Observações** (o que medimos periodicamente): `account_snapshots`, `investment_snapshots`, `card_bills`.
- **Objetivos**: `goals` (posição derivada do patrimônio).
- **Resultado calculado**: `monthly_projections` (cache materializado da projeção).

Isso espelha exatamente como a planilha legada já funcionava (abas separadas por natureza) e simplifica o motor de projeção.

### D2 — Frontend Next.js com export estático
Next.js (React) com `output: 'export'`, hospedado no GitHub Pages. Motivos: ecossistema maduro de gráficos para dashboards (Recharts), build estático simples, e melhor suporte de agentes de código do que Flutter Web. Todo acesso a dados é client-side via `@supabase/supabase-js` (anon key + RLS).

### D3 — Projeção calculada no cliente, cacheada no banco
O motor de projeção é uma função TypeScript pura (testável) que roda no cliente sobre os dados carregados. O resultado de meses fechados é persistido em `monthly_projections` para histórico e renderização rápida. Nenhuma lógica de negócio crítica em Edge Functions na fase inicial.

### D4 — Ingestão de dados por agentes
A alimentação do banco (saldos do mês, fatura fechada, nova previsão) é feita conversando com Claude (Cowork/Claude Code) conectado ao **Supabase MCP**. O arquivo `CLAUDE.md` e `docs/DATA_INGESTION.md` dão ao agente as regras do modelo. O app permanece somente leitura na prática cotidiana, com formulários de edição como fallback.

### D5 — Supabase como única fonte de verdade
Postgres com RLS por usuário autenticado (os dois perfis do casal compartilham os mesmos dados — RLS simples por `authenticated`). Schema versionado em `supabase/migrations/`.

## 3. Componentes

```
┌────────────────────────────┐      ┌──────────────────────────┐
│  web/ (Next.js estático)   │      │  Claude + Supabase MCP   │
│  GitHub Pages              │      │  (ingestão de dados)     │
│                            │      └───────────┬──────────────┘
│  • Dashboard prospectivo   │                  │ SQL
│  • Motor de projeção (TS)  │   supabase-js    │
│  • Motor de alocação (TS)  ├──────────┐       │
│  • Telas de metas/cadastro │          ▼       ▼
└────────────────────────────┘      ┌──────────────────────────┐
                                    │  Supabase                │
┌────────────────────────────┐      │  • Postgres + RLS        │
│  Edge Function (fase 4)    │◄─────┤  • Auth (casal)          │
│  IA Financial Advisor      │      │  • Edge Functions        │
│  (Anthropic API)           │      └──────────────────────────┘
└────────────────────────────┘
```

## 4. Modelo de dados (resumo)

Detalhes completos em [docs/DATA_MODEL.md](docs/DATA_MODEL.md).

| Grupo | Tabelas |
|---|---|
| Identidade | `profiles` |
| Estimativas | `recurring_incomes`, `recurring_expenses`, `one_off_incomes`, `planned_expenses` |
| Observações | `accounts`, `account_snapshots`, `credit_cards`, `card_bills`, `investments`, `investment_snapshots` |
| Metas | `goals` |
| Projeção | `monthly_projections` (cache) |

## 5. Épicos funcionais

1. **Dashboard prospectivo** — saldo livre projetado por mês (24 meses), linha de patrimônio, comparação com a linha-alvo das metas.
2. **Motor de projeção** — calcula receita, despesa, fatura e saldo livre por mês. Regras em [docs/PROJECTION_ENGINE.md](docs/PROJECTION_ENGINE.md).
3. **Motor de alocação** — posição das metas vem do patrimônio (por prazo, teto no alvo, cascata); o saldo livre futuro preenche o faltante.
4. **Gestão de metas** — CRUD de metas; posição, aporte mínimo e alcance são calculados (sem aportes manuais).
5. **IA Financial Advisor** (fase futura) — Edge Function envia JSON (mês atual + 6 meses projetados) à Anthropic API; retorna alertas de viabilidade e recomendações.

## 6. Autenticação e segurança

- Supabase Auth com dois usuários (Samuel, Ivana), dados compartilhados.
- RLS: todas as tabelas exigem `authenticated` **e** aprovação prévia (ver D6); sem multi-tenancy nesta fase.
- Anon key exposta no build estático é aceitável (RLS protege os dados).
- Chave da Anthropic API só em secrets de Edge Function, nunca no cliente.

### D6 — Acesso por aprovação (allowlist)
Login (e-mail/senha ou Google) continua aberto — qualquer pessoa com o link pode autenticar, inclusive porque a anon key exposta permite chamar `auth.signUp` diretamente. O que passou a ser restrito é o **acesso aos dados**: a tabela `approved_users` (migration `0008_approved_users_access_gate.sql`) guarda uma allowlist por e-mail, e a função `is_approved_user()` (security definer) substitui o `using (true)` das policies RLS em todas as tabelas de dados. Uma conta autenticada mas não aprovada consegue logar, mas toda query retorna vazio/nega escrita — o `AuthGate` (`web/components/AuthGate.tsx`) chama `is_approved_user()` via RPC logo após o login e mostra uma tela de "aguardando aprovação" em vez do app. Aprovar alguém é inserir o e-mail em `approved_users` via SQL (Supabase MCP/Studio) — não há UI de aprovação no app.
