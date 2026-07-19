<p align="center">
  <img src="assets/dinheiritos-logo.png" alt="Dinheiritos" width="180" />
</p>

# Dinheiritos

Web app de **planejamento e projeção financeira** para o casal Samuel e Ivana.

> **Importante:** o Dinheiritos **não é um controle de transações**. Ele não registra cada compra ou pagamento. Ele trabalha com **estimativas** (receitas e despesas recorrentes, previsões pontuais, faturas de cartão) e **snapshots mensais** (saldos de contas e investimentos) para responder à pergunta central: *"como estará nosso dinheiro nos próximos 24 meses, e quanto podemos destinar às metas?"*

## O que ele faz

- **Projeta o fluxo de caixa** dos próximos 24 meses a partir de receitas e despesas estimadas, previsões parceladas e faturas de cartão (reais ou valor-base).
- **Aloca o saldo livre** de cada mês entre as metas (reserva de emergência, viagens, previdência...), priorizando por peso e urgência do prazo.
- **Acompanha metas** com prazo, valor-alvo e aporte mensal necessário.
- **Consolida patrimônio**: snapshots mensais de contas e investimentos.
- **IA Advisor** (fase futura): análise do fluxo projetado com alertas de viabilidade.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js (React) com export estático → GitHub Pages |
| Backend & DB | Supabase (Postgres, Auth, RLS, Edge Functions) |
| Ingestão de dados | Agentes Claude via Supabase MCP (linguagem natural → banco) |
| IA | Anthropic API via Edge Functions (fase futura) |

## Estrutura do repositório

```
dinheiritos/
├── README.md              ← você está aqui
├── ARCHITECTURE.md        ← visão de arquitetura e decisões
├── ROADMAP.md             ← fases de desenvolvimento
├── CLAUDE.md              ← instruções para agentes (Claude Code/Cowork)
├── docs/
│   ├── DATA_MODEL.md      ← modelo de dados detalhado
│   ├── PROJECTION_ENGINE.md ← regras do motor de projeção e alocação
│   └── DATA_INGESTION.md  ← ingestão via agentes + migração dos dados legados
├── supabase/
│   └── migrations/        ← schema SQL versionado
├── web/                   ← aplicação Next.js (a criar)
├── data/
│   └── legacy/            ← planilha antiga a migrar (old_data.xlsx)
└── assets/                ← logos e imagens
```

## Começando

1. Ler [ARCHITECTURE.md](ARCHITECTURE.md) e [docs/DATA_MODEL.md](docs/DATA_MODEL.md).
2. Aplicar `supabase/migrations/0001_initial_schema.sql` no projeto Supabase.
3. Migrar os dados legados conforme [docs/DATA_INGESTION.md](docs/DATA_INGESTION.md).
4. Desenvolver o app em `web/` seguindo o [ROADMAP.md](ROADMAP.md).
