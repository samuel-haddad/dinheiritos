'use client';

import { useMemo, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import EntityManager, { ColumnDef, EntityConfig, FieldDef, Option } from '@/components/EntityManager';
import Shell from '@/components/Shell';
import Tabs from '@/components/Tabs';
import Toggle from '@/components/Toggle';
import { brl } from '@/lib/format';
import { addMonths, diffMonths, formatMonth } from '@/lib/engine/months';
import { profileName, useProfiles } from '@/lib/useProfiles';
import { creditCardName, useCreditCards } from '@/lib/useCreditCards';

const TABS = ['Receitas recorrentes', 'Despesas recorrentes', 'Receitas pontuais', 'Previsões'];

function money(v: any) {
  return v == null ? '—' : brl.format(Number(v));
}
function monthCell(v: any) {
  return v ? formatMonth(String(v)) : '—';
}

// --- Periodicidade (5.1.2) — compartilhada pelas abas de recorrentes ---
const PERIODICITY_OPTIONS: Option[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual' },
  { value: 'custom', label: 'Customizada' },
];
const periodicityFields: FieldDef[] = [
  { key: 'periodicity', label: 'Periodicidade', type: 'select', options: PERIODICITY_OPTIONS, required: true },
  {
    key: 'interval_months',
    label: 'Intervalo em meses (só p/ Customizada)',
    type: 'int',
    help: 'A cada quantos meses o valor se repete. Mensal = 1, Anual = 12.',
  },
];
const periodicityColumn: ColumnDef = {
  key: 'periodicity',
  label: 'Periodicidade',
  render: (r) =>
    r.periodicity === 'anual' ? 'Anual' : r.periodicity === 'custom' ? `A cada ${r.interval_months}m` : 'Mensal',
};
// Normaliza interval_months a partir da periodicidade escolhida.
const normalizePeriodicity = (row: Record<string, any>): Record<string, any> => {
  const p = row.periodicity || 'mensal';
  const interval = p === 'anual' ? 12 : p === 'custom' ? Math.max(1, Number(row.interval_months) || 1) : 1;
  return { ...row, periodicity: p, interval_months: interval };
};

function Lancamentos() {
  const [tab, setTab] = useState(TABS[0]);
  const [showActive, setShowActive] = useState(true);
  const profiles = useProfiles();
  const profOpts: Option[] = profiles.map((p) => ({ value: p.id, label: p.name }));
  const owner = (r: any) => profileName(profiles, r.profile_id);
  const cards = useCreditCards();
  const cardOpts: Option[] = cards.map((c) => ({
    value: c.id,
    label: `${c.name} (${profileName(profiles, c.profile_id)})`,
  }));

  const configs = useMemo<Record<string, EntityConfig>>(() => {
    const vigencia = (r: any) =>
      `${monthCell(r.start_month)} → ${r.end_month ? monthCell(r.end_month) : 'sem prazo'}`;
    return {
      'Receitas recorrentes': {
        table: 'recurring_incomes',
        addLabel: 'Nova receita recorrente',
        fields: [
          { key: 'name', label: 'Nome', type: 'text', required: true },
          { key: 'amount', label: 'Valor mensal (R$)', type: 'money', required: true },
          { key: 'receipt_day', label: 'Dia do recebimento', type: 'int' },
          { key: 'profile_id', label: 'Responsável', type: 'select', options: profOpts, required: true },
          { key: 'start_month', label: 'Início da vigência', type: 'month', required: true },
          { key: 'end_month', label: 'Fim da vigência (vazio = sem prazo)', type: 'month' },
          ...periodicityFields,
          { key: 'active', label: 'Ativa', type: 'checkbox' },
        ],
        columns: [
          { key: 'name', label: 'Receita' },
          { key: 'amount', label: 'Valor', right: true, render: (r) => money(r.amount) },
          { key: 'receipt_day', label: 'Dia' },
          { key: 'profile_id', label: 'Responsável', render: owner },
          { key: 'start_month', label: 'Vigência', render: vigencia },
          periodicityColumn,
          { key: 'active', label: 'Ativa', render: (r) => (r.active ? 'Sim' : 'Não') },
        ],
        defaults: { active: true, periodicity: 'mensal', start_month: new Date().toISOString().slice(0, 10) },
        order: [{ column: 'amount', ascending: false }],
        beforeSave: normalizePeriodicity,
      },
      'Despesas recorrentes': {
        table: 'recurring_expenses',
        addLabel: 'Nova despesa recorrente',
        fields: [
          { key: 'name', label: 'Nome', type: 'text', required: true },
          { key: 'amount', label: 'Valor mensal (R$)', type: 'money', required: true },
          { key: 'profile_id', label: 'Responsável', type: 'select', options: profOpts, required: true },
          { key: 'start_month', label: 'Início da vigência', type: 'month', required: true },
          { key: 'end_month', label: 'Fim da vigência (vazio = sem prazo)', type: 'month' },
          ...periodicityFields,
          { key: 'active', label: 'Ativa', type: 'checkbox' },
        ],
        columns: [
          { key: 'name', label: 'Despesa' },
          { key: 'amount', label: 'Valor', right: true, render: (r) => money(r.amount) },
          { key: 'profile_id', label: 'Responsável', render: owner },
          { key: 'start_month', label: 'Vigência', render: vigencia },
          periodicityColumn,
          { key: 'active', label: 'Ativa', render: (r) => (r.active ? 'Sim' : 'Não') },
        ],
        defaults: { active: true, periodicity: 'mensal', start_month: new Date().toISOString().slice(0, 10) },
        order: [{ column: 'amount', ascending: false }],
        beforeSave: normalizePeriodicity,
      },
      'Receitas pontuais': {
        table: 'one_off_incomes',
        addLabel: 'Nova receita pontual',
        fields: [
          { key: 'name', label: 'Nome', type: 'text', required: true },
          { key: 'amount', label: 'Valor (R$)', type: 'money', required: true },
          { key: 'expected_date', label: 'Data esperada', type: 'date', required: true },
          { key: 'profile_id', label: 'Responsável', type: 'select', options: profOpts, required: true },
          { key: 'confirmed', label: 'Confirmada (já caiu)', type: 'checkbox' },
          { key: 'active', label: 'Ativa', type: 'checkbox' },
        ],
        columns: [
          { key: 'name', label: 'Receita' },
          { key: 'amount', label: 'Valor', right: true, render: (r) => money(r.amount) },
          { key: 'expected_date', label: 'Data' },
          { key: 'profile_id', label: 'Responsável', render: owner },
          { key: 'confirmed', label: 'Confirmada', render: (r) => (r.confirmed ? '✅' : '—') },
          { key: 'active', label: 'Ativa', render: (r) => (r.active ? 'Sim' : 'Não') },
        ],
        defaults: { confirmed: false, active: true },
        order: [{ column: 'expected_date' }],
      },
      Previsões: {
        table: 'planned_expenses',
        addLabel: 'Nova previsão',
        fields: [
          { key: 'name', label: 'Nome', type: 'text', required: true },
          { key: 'total_amount', label: 'Valor total (R$)', type: 'money', required: true },
          { key: 'installments', label: 'Parcelas', type: 'int', required: true, help: '1 = à vista' },
          { key: 'start_month', label: 'Primeira parcela', type: 'month', required: true },
          { key: 'profile_id', label: 'Responsável', type: 'select', options: profOpts, required: true },
          { key: 'confirmed', label: 'Compromisso confirmado', type: 'checkbox' },
          { key: 'is_card_expense', label: 'Cartão', type: 'checkbox' },
          {
            key: 'credit_card_id',
            label: 'Cartão vinculado',
            type: 'select',
            options: cardOpts,
            showIf: (f) => Boolean(f.is_card_expense),
            help: 'Quando a fatura do mês já tiver sido lançada, a parcela some do cálculo naquele mês (já está na fatura real).',
          },
          { key: 'active', label: 'Ativa', type: 'checkbox' },
        ],
        columns: [
          { key: 'name', label: 'Previsão' },
          { key: 'total_amount', label: 'Total', right: true, render: (r) => money(r.total_amount) },
          {
            key: 'installments',
            label: 'Parcelas',
            render: (r) => `${r.installments}× ${brl.format(Number(r.installment_amount))}`,
          },
          {
            key: 'start_month',
            label: 'Período',
            render: (r) => `${monthCell(r.start_month)} → ${monthCell(addMonths(r.end_month, -1))}`,
          },
          { key: 'profile_id', label: 'Responsável', render: owner },
          {
            key: 'is_card_expense',
            label: 'Cartão',
            render: (r) => (r.is_card_expense ? creditCardName(cards, r.credit_card_id) : 'Não'),
          },
          { key: 'active', label: 'Ativa', render: (r) => (r.active ? 'Sim' : 'Não') },
        ],
        defaults: { installments: '1', confirmed: false, active: true, is_card_expense: false },
        order: [{ column: 'start_month' }],
        beforeSave: (row) => {
          const n = Math.max(1, Number(row.installments) || 1);
          if (!row.total_amount || !row.start_month) return 'Preencha valor total e primeira parcela.';
          if (row.is_card_expense && !row.credit_card_id) return 'Selecione o cartão vinculado.';
          return {
            ...row,
            installments: n,
            installment_amount: Math.round((Number(row.total_amount) / n) * 100) / 100,
            end_month: addMonths(String(row.start_month), n),
            credit_card_id: row.is_card_expense ? row.credit_card_id : null,
          };
        },
      },
    };
  }, [profOpts, cardOpts, cards]);

  return (
    <>
      <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
        Os insumos do motor de projeção. Mudou um salário ou despesa fixa? Encerre a vigência do
        registro atual e crie um novo — o histórico fica preservado.
      </p>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <Toggle on={showActive} onChange={setShowActive} onLabel="Ativas" offLabel="Desativadas" />
      </div>
      <EntityManager
        key={tab}
        config={configs[tab]}
        rowFilter={(r) => (showActive ? !!r.active : !r.active)}
      />
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Shell>
        <Lancamentos />
      </Shell>
    </AuthGate>
  );
}
