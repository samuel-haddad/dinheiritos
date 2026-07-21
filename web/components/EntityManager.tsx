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

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor">
      <path d="M13 4l3 3-8.5 8.5L4 16.5l1-3.5L13 4Z" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function DeleteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor">
      <path d="M5 6h10M8 6V4.5h4V6M6.5 6l.5 9h6l.5-9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const hasActiveField = config.fields.some((f) => f.key === 'active' && f.type === 'checkbox');

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

  // Descarta seleção de linhas que sumiram (excluídas em outro lugar, filtro mudou etc.).
  useEffect(() => {
    if (!rows) return;
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`Excluir ${ids.length} registro(s)?`)) return;
    setBulkBusy(true);
    const { error } = await supabase().from(config.table).delete().in('id', ids);
    setBulkBusy(false);
    if (error) setError(error.message);
    else {
      setSelected(new Set());
      load();
      onChanged?.();
    }
  }

  async function bulkSetActive(ids: string[], active: boolean) {
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase().from(config.table).update({ active }).in('id', ids);
    setBulkBusy(false);
    if (error) setError(error.message);
    else {
      setSelected(new Set());
      load();
      onChanged?.();
    }
  }

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

  if (!rows) return <p style={{ color: 'var(--muted)' }}>Carregando…</p>;

  const visibleRows = rowFilter ? rows.filter(rowFilter) : rows;
  const visibleIds = visibleRows.map((r) => r.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const someSelected = selectedVisible.length > 0 && !allSelected;

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        {visibleRows.length > 0 && (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={(e) => setSelected(e.target.checked ? new Set(visibleIds) : new Set())}
            title="Selecionar todos"
            style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
          />
        )}
        <p className="m-0 text-[13px]" style={{ color: 'var(--muted)' }}>{visibleRows.length} registro(s)</p>
        <button
          className="btn-primary ml-auto"
          onClick={() => {
            setEditingId(null);
            setForm(toForm(config.fields, config.defaults));
          }}
        >
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path d="M10 4v12M4 10h12" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          {config.addLabel}
        </button>
      </div>

      {selectedVisible.length > 0 && (
        <div
          className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-2xl px-4 py-2.5"
          style={{ background: 'var(--nav-active-bg)' }}
        >
          <span className="text-[13px] font-semibold" style={{ color: 'var(--accent-strong)' }}>
            {selectedVisible.length} selecionado(s)
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {hasActiveField && (
              <>
                <button
                  className="btn-secondary !py-1.5 !text-[12.5px]"
                  disabled={bulkBusy}
                  onClick={() => bulkSetActive(selectedVisible, true)}
                >
                  Ativar
                </button>
                <button
                  className="btn-secondary !py-1.5 !text-[12.5px]"
                  disabled={bulkBusy}
                  onClick={() => bulkSetActive(selectedVisible, false)}
                >
                  Desativar
                </button>
              </>
            )}
            <button className="btn-danger" disabled={bulkBusy} onClick={() => bulkDelete(selectedVisible)}>
              Excluir
            </button>
            <button className="btn-ghost" onClick={() => setSelected(new Set())}>
              Cancelar seleção
            </button>
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-sm" style={{ color: 'var(--neg)' }}>{error}</p>}

      {visibleRows.length === 0 ? (
        <div className="empty-state">
          <p className="font-display m-0 mb-1 font-semibold" style={{ color: 'var(--ink)' }}>Nada por aqui ainda</p>
          <p className="m-0 text-[13.5px]" style={{ color: 'var(--muted)' }}>
            {config.empty ?? 'Nenhum registro ainda.'}
          </p>
        </div>
      ) : (
        <div className="table-shell overflow-x-auto">
          <table className="min-w-[560px]">
            <thead>
              <tr>
                <th className="w-9" />
                {config.columns.map((c) => (
                  <th key={c.key} className={c.right ? 'text-right' : ''}>
                    {c.label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                    />
                  </td>
                  {config.columns.map((c) => (
                    <td key={c.key} className={c.right ? 'num text-right' : ''}>
                      {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                    </td>
                  ))}
                  <td className="whitespace-nowrap text-right">
                    <button
                      className="btn-ghost !px-2"
                      title="Editar"
                      onClick={() => {
                        setEditingId(r.id);
                        setForm(toForm(config.fields, r));
                      }}
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="btn-ghost !px-2"
                      title="Excluir"
                      style={{ color: 'var(--neg)' }}
                      onClick={() => remove(r)}
                    >
                      <DeleteIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-display text-[18px] font-bold" style={{ color: 'var(--ink)' }}>
                {editingId ? 'Editar' : config.addLabel}
              </h3>
              <button onClick={() => setForm(null)} className="btn-ghost" aria-label="Fechar">
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {config.fields.map((fd) => (
                <div key={fd.key}>
                  {fd.type === 'select' ? (
                    <>
                      <label className="mb-1.5 block text-[12.5px] font-semibold" style={{ color: 'var(--muted)' }}>
                        {fd.label}
                        {fd.required && ' *'}
                      </label>
                      <select
                        className="input"
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
                    </>
                  ) : fd.type === 'checkbox' ? (
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form[fd.key])}
                        onChange={(e) => setForm({ ...form, [fd.key]: e.target.checked })}
                        style={{ width: 17, height: 17, accentColor: 'var(--accent)' }}
                      />
                      {fd.label}
                    </label>
                  ) : (
                    <>
                      <label className="mb-1.5 block text-[12.5px] font-semibold" style={{ color: 'var(--muted)' }}>
                        {fd.label}
                        {fd.required && ' *'}
                      </label>
                      <input
                        className="input"
                        type={fd.type === 'month' ? 'month' : fd.type === 'date' ? 'date' : 'text'}
                        inputMode={fd.type === 'money' || fd.type === 'int' ? 'decimal' : undefined}
                        value={form[fd.key]}
                        onChange={(e) => setForm({ ...form, [fd.key]: e.target.value })}
                      />
                    </>
                  )}
                  {fd.help && <span className="mt-1 block text-[11px]" style={{ color: 'var(--muted)' }}>{fd.help}</span>}
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2.5 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
              <button onClick={() => setForm(null)} className="btn-secondary">Cancelar</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
