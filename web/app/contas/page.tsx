'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import EntityManager, { EntityConfig, Option } from '@/components/EntityManager';
import Shell from '@/components/Shell';
import Tabs from '@/components/Tabs';
import { brl } from '@/lib/format';
import { formatMonth } from '@/lib/engine/months';
import { supabase } from '@/lib/supabase';
import { profileName, useProfiles } from '@/lib/useProfiles';
import type { Account, AccountSnapshot } from '@/lib/types';

const TABS = ['Saldos mensais', 'Contas cadastradas'];

function Contas() {
  const [tab, setTab] = useState(TABS[0]);
  const profiles = useProfiles();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snapshots, setSnapshots] = useState<AccountSnapshot[]>([]);
  const [bump, setBump] = useState(0);

  const reload = useCallback(async () => {
    const db = supabase();
    const [a, s] = await Promise.all([
      db.from('accounts').select('*').order('name'),
      db.from('account_snapshots').select('*').order('month', { ascending: false }),
    ]);
    setAccounts((a.data as Account[]) ?? []);
    setSnapshots((s.data as AccountSnapshot[]) ?? []);
  }, []);
  useEffect(() => {
    reload();
  }, [reload, bump]);

  const accName = useCallback(
    (id: string) => {
      const a = accounts.find((x) => x.id === id);
      return a ? `${a.name} (${profileName(profiles, a.profile_id)})` : '—';
    },
    [accounts, profiles]
  );

  // resumo: último saldo por conta, agrupado por pessoa
  const summary = useMemo(() => {
    const latest = new Map<string, AccountSnapshot>();
    for (const s of snapshots) {
      const cur = latest.get(s.account_id);
      if (!cur || s.month > cur.month) latest.set(s.account_id, s);
    }
    const byProfile = new Map<string, { name: string; total: number; items: { acc: Account; snap: AccountSnapshot }[] }>();
    for (const acc of accounts) {
      const snap = latest.get(acc.id);
      if (!snap) continue;
      const key = acc.profile_id;
      if (!byProfile.has(key))
        byProfile.set(key, { name: profileName(profiles, key), total: 0, items: [] });
      const g = byProfile.get(key)!;
      g.total += Number(snap.balance);
      g.items.push({ acc, snap });
    }
    return [...byProfile.values()];
  }, [accounts, snapshots, profiles]);

  const profOpts: Option[] = profiles.map((p) => ({ value: p.id, label: p.name }));
  const accOpts: Option[] = accounts.map((a) => ({
    value: a.id,
    label: `${a.name} (${profileName(profiles, a.profile_id)})`,
  }));

  const snapshotConfig: EntityConfig = {
    table: 'account_snapshots',
    addLabel: 'Lançar saldo do mês',
    empty: 'Nenhum saldo lançado. Lance a posição de cada conta no fechamento do mês.',
    fields: [
      { key: 'account_id', label: 'Conta', type: 'select', options: accOpts, required: true },
      { key: 'month', label: 'Mês de referência', type: 'month', required: true },
      { key: 'balance', label: 'Saldo (R$)', type: 'money', required: true },
      { key: 'measured_at', label: 'Data da medição', type: 'date' },
    ],
    columns: [
      { key: 'account_id', label: 'Conta', render: (r) => accName(r.account_id) },
      { key: 'month', label: 'Mês', render: (r) => formatMonth(r.month) },
      { key: 'balance', label: 'Saldo', right: true, render: (r) => brl.format(Number(r.balance)) },
      { key: 'measured_at', label: 'Medido em' },
    ],
    defaults: { measured_at: new Date().toISOString().slice(0, 10) },
    order: [{ column: 'month', ascending: false }],
    upsertConflict: 'account_id,month',
  };

  const accountConfig: EntityConfig = {
    table: 'accounts',
    addLabel: 'Nova conta',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', required: true },
      { key: 'institution', label: 'Instituição', type: 'text' },
      { key: 'profile_id', label: 'Responsável', type: 'select', options: profOpts, required: true },
      { key: 'logo_url', label: 'URL do logo', type: 'text' },
      { key: 'active', label: 'Ativa', type: 'checkbox' },
    ],
    columns: [
      {
        key: 'name',
        label: 'Conta',
        render: (r) => (
          <span className="flex items-center gap-2">
            {r.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.logo_url} alt="" className="h-6 w-6 rounded object-cover" />
            )}
            {r.name}
          </span>
        ),
      },
      { key: 'institution', label: 'Instituição' },
      { key: 'profile_id', label: 'Responsável', render: (r) => profileName(profiles, r.profile_id) },
      { key: 'active', label: 'Ativa', render: (r) => (r.active ? 'Sim' : 'Não') },
    ],
    defaults: { active: true },
    order: [{ column: 'name' }],
  };

  return (
    <>
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        {summary.map((g) => (
          <div key={g.name} className="card !p-5">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="font-display font-semibold" style={{ color: 'var(--ink)' }}>{g.name}</h2>
              <span className="num font-display font-bold" style={{ color: 'var(--accent-strong)' }}>{brl.format(g.total)}</span>
            </div>
            <ul className="space-y-1 text-sm" style={{ color: 'var(--muted)' }}>
              {g.items.map(({ acc, snap }) => (
                <li key={acc.id} className="flex justify-between">
                  <span>{acc.name}</span>
                  <span className="num">
                    {brl.format(Number(snap.balance))}{' '}
                    <span className="text-xs">({formatMonth(snap.month)})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'Saldos mensais' ? (
        <EntityManager key={`s${bump}`} config={snapshotConfig} onChanged={() => setBump((b) => b + 1)} />
      ) : (
        <EntityManager key={`a${bump}`} config={accountConfig} onChanged={() => setBump((b) => b + 1)} />
      )}
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Shell>
        <Contas />
      </Shell>
    </AuthGate>
  );
}
