# CLAUDE.md — Instruções para agentes

## O projeto

Dinheiritos: web app de **planejamento e projeção financeira** (não é controle de transações). Next.js estático (`web/`) + Supabase. Leia `ARCHITECTURE.md` antes de mudanças estruturais.

## Regras de ouro

- **Não existe tabela `transactions`.** O modelo é estimativas + snapshots + metas (ver `docs/DATA_MODEL.md`). Não reintroduza lançamento de transações individuais.
- O motor de projeção (`docs/PROJECTION_ENGINE.md`) é função pura em TypeScript — sem I/O, com testes unitários.
- Valores monetários: `numeric` no banco, nunca float. Moeda: BRL.
- Meses de referência: `date` no dia 1.
- Schema só muda via nova migration em `supabase/migrations/` (nunca editar migrations aplicadas).

## Projeto Supabase

- As tabelas do Dinheiritos vivem no projeto **estudo-tcdf** (`wlogwtbfxnomuakklrpy`), schema `public`, junto com as tabelas de outro app (nomes em português: `modulo`, `licao`, etc. — **não tocar nelas**).
- Tabelas do Dinheiritos têm nomes em inglês (ver `docs/DATA_MODEL.md`).
- Profiles: Samuel `e0bde878-32b5-59b2-8f55-e0c150ea5422`, Ivana `fe5ad63e-3896-5ed0-bac1-9b80dfeda108`.
- Dados legados já migrados (16/07/2026); não reimportar `old_data.xlsx`.

## Ingestão de dados (Supabase MCP)

Ao inserir/atualizar dados a pedido do Samuel ou da Ivana, siga `docs/DATA_INGESTION.md`. Para ingestão por **print/texto/tabela** (saldos e faturas → upsert), use o runbook `docs/INGESTION_AGENT.md`, que traz o mapa de entidades (ids + apelidos) e os templates de upsert. Resumo:

- Upsert em snapshots (únicos por entidade+mês), nunca duplicar.
- Mudança de renda/despesa recorrente: encerrar registro vigente e criar novo — preservar histórico.
- Todo registro tem `profile_id` (Samuel ou Ivana); se ambíguo, perguntar.
- Confirmar antes de qualquer DELETE.
- Interpretar valores em formato brasileiro ("5.321,81" = 5321.81).

## Frontend (`web/`)

- Next.js com `output: 'export'` (GitHub Pages) — nada de API routes ou SSR.
- Acesso a dados client-side via `@supabase/supabase-js` (anon key + RLS).
- Gráficos com Recharts. Idioma da UI: pt-BR.
- Segredos: só `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no cliente. Chave Anthropic apenas em secrets de Edge Function.

## Dados legados

`data/legacy/old_data.xlsx` é somente leitura — fonte da migração inicial. Não editar nem deletar.
