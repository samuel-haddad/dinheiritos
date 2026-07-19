'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import EntityManager, { EntityConfig, Option } from '@/components/EntityManager';
import Nav from '@/components/Nav';
import Tabs from '@/components/Tabs';
import Toggle from '@/components/Toggle';
import { brl } from '@/lib/format';
import { formatMonth } from '@/lib/engine/months';
import { defaultStartMonth } from '@/lib/engine/projection';
import { supabase } from '@/lib/supabase';
import { profileName, useProfiles } from '@/lib/useProfiles';
import type { CreditCard } from '@/lib/types';

const TABS = ['Faturas', 'Cartões cadastrados'];

function Cartoes() {
  const [tab, setTab] = useState(TABS[0]);
  const [emAberto, setEmAberto] = useState(true);
  const profiles = useProfiles();
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [bump, setBump] = useState(0);
  const currentMonth = defaultStartMonth();

  const reload = useCallback(async () => {
    const { data } = await supabase().from('credit_cards').select('*').order('name');
    setCards((data as CreditCard[]) ?? []);
  }, []);
  useEffect(() => {
    reload();
  }, [reload, bump]);

  const cardCell = useCallback(
    (id: string) => {
      const c = cards.find((x) => x.id === id);
      if (!c) return '—';
      return (
        <span className="flex items-center gap-2">
          {c.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.logo_url} alt="" className="h-6 w-6 rounded object-cover" />
          )}
          {c.name}
        </span>
      );
    },
    [cards]
  );

  const profOpts: Option[] = profiles.map((p) => ({ value: p.id, label: p.name }));
  const cardOpts: Option[] = cards.map((c) => ({
    value: c.id,
    label: `${c.name} (${profileName(profiles, c.profile_id)})`,
  }));

  const billConfig: EntityConfig = {
    table: 'card_bills',
    addLabel: 'Lançar fatura',
    empty: 'Nenhuma fatura lançada.',
    fields: [
      { key: 'credit_card_id', label: 'Cartão', type: 'select', options: cardOpts, required: true },
      { key: 'month', label: 'Mês de vencimento', type: 'month', required: true },
      { key: 'amount', label: 'Valor da fatura (R$)', type: 'money', required: true },
    ],
    columns: [
      { key: 'credit_card_id', label: 'Cartão', render: (r) => cardCell(r.credit_card_id) },
      { key: 'month', label: 'Vencimento', render: (r) => formatMonth(r.month) },
      { key: 'amount', label: 'Fatura', right: true, render: (r) => brl.format(Number(r.amount)) },
    ],
    defaults: {},
    order: [{ column: 'month', ascending: true }],
    upsertConflict: 'credit_card_id,month',
  };

  const cardConfig: EntityConfig = {
    table: 'credit_cards',
    addLabel: 'Novo cartão',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', required: true },
      { key: 'due_day', label: 'Dia do vencimento', type: 'int' },
      {
        key: 'base_amount',
        label: 'Valor-base (R$)',
        type: 'money',
        required: true,
        help: 'Estimativa usada nos meses futuros sem fatura lançada.',
      },
      { key: 'profile_id', label: 'Responsável', type: 'select', options: profOpts, required: true },
      { key: 'logo_url', label: 'URL do logo', type: 'text' },
      { key: 'active', label: 'Ativo', type: 'checkbox' },
    ],
    columns: [
      { key: 'name', label: 'Cartão', render: (r) => cardCell(r.id) },
      { key: 'due_day', label: 'Venc.' },
      { key: 'base_amount', label: 'Valor-base', right: true, render: (r) => brl.format(Number(r.base_amount)) },
      { key: 'profile_id', label: 'Responsável', render: (r) => profileName(profiles, r.profile_id) },
      { key: 'active', label: 'Ativo', render: (r) => (r.active ? 'Sim' : 'Não') },
    ],
    defaults: { active: true, base_amount: '0' },
    order: [{ column: 'name' }],
  };

  return (
    <>
      <h1 className="mb-1 text-xl font-bold">Cartões e faturas</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        A projeção usa a fatura real quando lançada; sem fatura, usa o valor-base do cartão.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {tab === 'Faturas' && (
          <div className="mb-4">
            <Toggle on={emAberto} onChange={setEmAberto} onLabel="Em aberto" offLabel="Todas" />
          </div>
        )}
      </div>
      {tab === 'Faturas' ? (
        <EntityManager
          key={`b${bump}`}
          config={billConfig}
          onChanged={() => setBump((b) => b + 1)}
          rowFilter={emAberto ? (r) => r.month >= currentMonth : undefined}
        />
      ) : (
        <EntityManager key={`c${bump}`} config={cardConfig} onChanged={() => setBump((b) => b + 1)} />
      )}
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-6xl p-4 md:p-8">
        <Nav />
        <Cartoes />
      </main>
    </AuthGate>
  );
}
