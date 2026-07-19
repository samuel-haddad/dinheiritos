'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';
import AuthGate from '@/components/AuthGate';
import EntityManager, { EntityConfig, Option } from '@/components/EntityManager';
import Nav from '@/components/Nav';
import Tabs from '@/components/Tabs';
import { brl } from '@/lib/format';
import { formatMonth } from '@/lib/engine/months';
import { supabase } from '@/lib/supabase';
import { profileName, useProfiles } from '@/lib/useProfiles';
import type { Investment, InvestmentSnapshot } from '@/lib/types';

const TABS = ['Posições mensais', 'Investimentos cadastrados'];
const TYPE_LABEL: Record<string, string> = {
  renda_fixa: 'Renda fixa',
  renda_variavel: 'Renda variável',
  fundos: 'Fundos',
  conta: 'Conta',
};
const tooltipStyle = {
  background: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 8,
  color: 'var(--tooltip-text)',
  fontSize: 12,
};
const COLORS = ['#f97316', '#58a6e8', '#22c55e', '#e879f9', '#facc15', '#f87171', '#2dd4bf', '#a78bfa'];

function Investimentos() {
  const [tab, setTab] = useState(TABS[0]);
  const profiles = useProfiles();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [snapshots, setSnapshots] = useState<InvestmentSnapshot[]>([]);
  const [bump, setBump] = useState(0);

  const reload = useCallback(async () => {
    const db = supabase();
    const [i, s] = await Promise.all([
      db.from('investments').select('*').order('name'),
      db.from('investment_snapshots').select('*').order('month'),
    ]);
    setInvestments((i.data as Investment[]) ?? []);
    setSnapshots((s.data as InvestmentSnapshot[]) ?? []);
  }, []);
  useEffect(() => {
    reload();
  }, [reload, bump]);

  const invName = useCallback(
    (id: string) => {
      const i = investments.find((x) => x.id === id);
      return i ? `${i.name} · ${profileName(profiles, i.profile_id)}` : '—';
    },
    [investments, profiles]
  );

  // Evolução: total por mês e por pessoa
  const evolution = useMemo(() => {
    const months = [...new Set(snapshots.map((s) => s.month))].sort();
    const owners = [...new Set(investments.map((i) => i.profile_id))];
    return months.map((m) => {
      const row: Record<string, any> = { month: m, label: formatMonth(m), Total: 0 };
      for (const pid in Object.fromEntries(owners.map((o) => [o, 1]))) row[profileName(profiles, pid)] = 0;
      for (const s of snapshots.filter((x) => x.month === m)) {
        const inv = investments.find((i) => i.id === s.investment_id);
        if (!inv) continue;
        const owner = profileName(profiles, inv.profile_id);
        row[owner] = (row[owner] ?? 0) + Number(s.balance);
        row.Total += Number(s.balance);
      }
      return row;
    });
  }, [snapshots, investments, profiles]);

  const ownerNames = useMemo(
    () => [...new Set(investments.map((i) => profileName(profiles, i.profile_id)))].filter((n) => n !== '—'),
    [investments, profiles]
  );

  // resumo: última posição por investimento
  const summary = useMemo(() => {
    const latest = new Map<string, InvestmentSnapshot>();
    for (const s of snapshots) {
      const cur = latest.get(s.investment_id);
      if (!cur || s.month > cur.month) latest.set(s.investment_id, s);
    }
    let total = 0;
    latest.forEach((s) => (total += Number(s.balance)));
    return { latest, total };
  }, [snapshots]);

  const profOpts: Option[] = profiles.map((p) => ({ value: p.id, label: p.name }));
  const invOpts: Option[] = investments.map((i) => ({ value: i.id, label: invName(i.id) }));

  const snapshotConfig: EntityConfig = {
    table: 'investment_snapshots',
    addLabel: 'Lançar posição do mês',
    empty: 'Nenhuma posição lançada.',
    fields: [
      { key: 'investment_id', label: 'Investimento', type: 'select', options: invOpts, required: true },
      { key: 'month', label: 'Mês de referência', type: 'month', required: true },
      { key: 'balance', label: 'Posição (R$)', type: 'money', required: true },
      { key: 'measured_at', label: 'Data da medição', type: 'date' },
    ],
    columns: [
      { key: 'investment_id', label: 'Investimento', render: (r) => invName(r.investment_id) },
      { key: 'month', label: 'Mês', render: (r) => formatMonth(r.month) },
      { key: 'balance', label: 'Posição', right: true, render: (r) => brl.format(Number(r.balance)) },
      { key: 'measured_at', label: 'Medido em' },
    ],
    defaults: { measured_at: new Date().toISOString().slice(0, 10) },
    order: [{ column: 'month', ascending: false }],
    upsertConflict: 'investment_id,month',
  };

  const investmentConfig: EntityConfig = {
    table: 'investments',
    addLabel: 'Novo investimento',
    fields: [
      { key: 'name', label: 'Nome', type: 'text', required: true },
      { key: 'institution', label: 'Instituição', type: 'text' },
      {
        key: 'type', label: 'Tipo', type: 'select', required: true,
        options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
      },
      { key: 'profile_id', label: 'Responsável', type: 'select', options: profOpts, required: true },
      { key: 'active', label: 'Ativo', type: 'checkbox' },
    ],
    columns: [
      { key: 'name', label: 'Investimento' },
      { key: 'institution', label: 'Instituição' },
      { key: 'type', label: 'Tipo', render: (r) => TYPE_LABEL[r.type] ?? r.type },
      { key: 'profile_id', label: 'Responsável', render: (r) => profileName(profiles, r.profile_id) },
      {
        key: 'id', label: 'Última posição', right: true,
        render: (r) => {
          const s = summary.latest.get(r.id);
          return s ? `${brl.format(Number(s.balance))} (${formatMonth(s.month)})` : '—';
        },
      },
    ],
    defaults: { active: true },
    order: [{ column: 'name' }],
  };

  return (
    <>
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Investimentos</h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Total investido: <strong className="text-accent-600 dark:text-accent-400">{brl.format(summary.total)}</strong>
        </span>
      </div>

      <section className="card mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Evolução das posições
        </h2>
        {evolution.length < 2 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            O gráfico aparece a partir de dois meses de posições lançadas — continue registrando os
            fechamentos mensais.
          </p>
        ) : (
          <div className="text-slate-600 dark:text-slate-300">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={evolution} margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} />
                <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => brl.format(Number(v))} contentStyle={tooltipStyle} />
                <Legend />
                <Line type="monotone" dataKey="Total" stroke="#f97316" strokeWidth={2.5} dot />
                {ownerNames.map((n, i) => (
                  <Line key={n} type="monotone" dataKey={n} stroke={COLORS[(i + 1) % COLORS.length]} strokeWidth={1.5} dot />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'Posições mensais' ? (
        <EntityManager key={`s${bump}`} config={snapshotConfig} onChanged={() => setBump((b) => b + 1)} />
      ) : (
        <EntityManager key={`i${bump}`} config={investmentConfig} onChanged={() => setBump((b) => b + 1)} />
      )}
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-6xl p-4 md:p-8">
        <Nav />
        <Investimentos />
      </main>
    </AuthGate>
  );
}
