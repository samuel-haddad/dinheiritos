'use client';

// CRUD genérico dirigido por configuração: tabela + modal de formulário.
// Usado por Lançamentos, Contas, Cartões, Investimentos.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fromMonthInput, parseMoney, toMonthInput } from '@/lib/format';

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'money' | 'int' | 'month' | 'date' | 'select' | 'checkbox';
  options?: Option[];
  required?: boolean;
  help?: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  right?: boolean;
  render?: (row: any) => React.ReactNode;
}

export interface EntityConfig {
  table: string;
  addLabel: string;
  empty?: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  defaults: Record<string, any>;
  order: { column: string; ascending?: boolean }[];
  /** transforma o registro antes de salvar (ex.: calcular parcela) */
  beforeSave?: (row: Record<string, any>) => Record<string, any> | string;
  /** upsert com conflito (ex.: 'account_id,month' para snapshots) */
  upsertConflict?: string;
}

function toForm(fields: FieldDef[], row: Record<string, any>): Record<string, any> {
  const f: Record<string, any> = {};
  for (const fd of fields) {
    const v = row[fd.key];
    if (fd.type === 'month') f[fd.key] = v ? toMonthInput(String(v)) : '';
    else if (fd.type === 'money') f[fd.key] = v == null ? '' : String(v).replace('.', ',');
    else if (fd.type === 'checkbox') f[fd.key] = Boolean(v);
    else f[fd.key] = v == null ? '' : String(v);
  }
  return f;
}

function fromForm(fields: FieldDef[], form: Record<string, any>): Record<string, any> | string {
  const row: Record<string, any> = {};
  for (const fd of fields) {
    const v = form[fd.key];
    if (fd.type === 'month') {
      if (!v && fd.required) return `Preencha "${fd.label}".`;
      row[fd.key] = v ? fromMonthInput(v) : null;
    } else if (fd.type === 'money') {
      const n = parseMoney(v);
      if (Number.isNaN(n)) {
        if (fd.required) return `Valor inválido em "${fd.label}".`;
        row[fd.key] = null;
      } else row[fd.key] = n;
    } else if (fd.type === 'int') {
      const n = parseInt(v, 10);
      if (Number.isNaN(n)) {
        if (fd.required) return `Número inválido em "${fd.label}".`;
        row[fd.key] = null;
      } else row[fd.key] = n;
    } else if (fd.type === 'checkbox') {
      row[fd.key] = Boolean(v);
    } else {
      if (!v && fd.required) return `Preencha "${fd.label}".`;
      row[fd.key] = v || null;
    }
  }
  return row;
}

export default function EntityManager({
  config,
  onChanged,
  rowFilter,
}: {
  config: EntityConfig;
  onChanged?: () => void;
  /** Filtro de exibição aplicado sobre as linhas carregadas (não afeta o banco). */
  rowFilter?: (row: any) => boolean;
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    let q = supabase().from(config.table).select('*');
    for (const o of config.order) q = q.order(o.column, { ascending: o.ascending ?? true });
    const { data, error } = await q;
    if (error) setError(error.message);
    else setRows(data ?? []);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!form) return;
    const parsed = fromForm(config.fields, form);
    if (typeof parsed === 'string') return setError(parsed);
    let row = parsed;
    if (config.beforeSave) {
      const t = config.beforeSave(row);
      if (typeof t === 'string') return setError(t);
      row = t;
    }
    setSaving(true);
    setError(null);
    const db = supabase();
    let error;
    if (editingId) {
      ({ error } = await db.from(config.table).update(row).eq('id', editingId));
    } else if (config.upsertConflict) {
      ({ error } = await db.from(config.table).upsert(row, { onConflict: config.upsertConflict }));
    } else {
      ({ error } = await db.from(config.table).insert(row));
    }
    setSaving(false);
    if (error) setError(error.message);
    else {
      setForm(null);
      setEditingId(null);
      load();
      onChanged?.();
    }
  }

  async function remove(row: any) {
    if (!confirm('Excluir este registro?')) return;
    const { error } = await supabase().from(config.table).delete().eq('id', row.id);
    if (error) setError(error.message);
    else {
      load();
      onChanged?.();
    }
  }

  if (!rows) return <p className="text-slate-400">Carregando…</p>;

  const visibleRows = rowFilter ? rows.filter(rowFilter) : rows;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-400">{visibleRows.length} registro(s)</p>
        <button
          className="btn-primary"
          onClick={() => {
            setEditingId(null);
            setForm(toForm(config.fields, config.defaults));
          }}
        >
          + {config.addLabel}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {visibleRows.length === 0 ? (
        <p className="card text-sm text-slate-500 dark:text-slate-400">
          {config.empty ?? 'Nenhum registro ainda.'}
        </p>
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-navy-700">
                {config.columns.map((c) => (
                  <th key={c.key} className={`px-4 py-3 ${c.right ? 'text-right' : ''}`}>
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-700">
              {visibleRows.map((r) => (
                <tr key={r.id}>
                  {config.columns.map((c) => (
                    <td key={c.key} className={`px-4 py-2.5 ${c.right ? 'text-right tabular-nums' : ''}`}>
                      {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      className="btn-ghost !px-2"
                      onClick={() => {
                        setEditingId(r.id);
                        setForm(toForm(config.fields, r));
                      }}
                    >
                      ✏️
                    </button>
                    <button className="btn-ghost !px-2" onClick={() => remove(r)}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setForm(null)}
        >
          <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">{editingId ? 'Editar' : config.addLabel}</h3>
              <button onClick={() => setForm(null)} className="btn-ghost">
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {config.fields.map((fd) => (
                <label key={fd.key} className="block text-xs text-slate-500 dark:text-slate-400">
                  {fd.type !== 'checkbox' && (
                    <>
                      {fd.label}
                      {fd.required && ' *'}
                    </>
                  )}
                  {fd.type === 'select' ? (
                    <select
                      className="input mt-1"
                      value={form[fd.key]}
                      onChange={(e) => setForm({ ...form, [fd.key]: e.target.value })}
                    >
                      <option value="">—</option>
                      {fd.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : fd.type === 'checkbox' ? (
                    <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={Boolean(form[fd.key])}
                        onChange={(e) => setForm({ ...form, [fd.key]: e.target.checked })}
                      />
                      {fd.label}
                    </span>
                  ) : (
                    <input
                      className="input mt-1"
                      type={fd.type === 'month' ? 'month' : fd.type === 'date' ? 'date' : 'text'}
                      inputMode={fd.type === 'money' || fd.type === 'int' ? 'decimal' : undefined}
                      value={form[fd.key]}
                      onChange={(e) => setForm({ ...form, [fd.key]: e.target.value })}
                    />
                  )}
                  {fd.help && <span className="mt-0.5 block text-[11px] text-slate-400">{fd.help}</span>}
                </label>
              ))}
              <button onClick={save} disabled={saving} className="btn-primary w-full">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
