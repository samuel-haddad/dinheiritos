export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Aceita "1.234,56", "1234,56" e "1234.56". */
export function parseMoney(s: string): number {
  const t = String(s).trim();
  if (!t) return NaN;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return Number(normalized);
}

export const toMonthInput = (m: string) => m.slice(0, 7); // '2026-07-01' -> '2026-07'
export const fromMonthInput = (v: string) => `${v}-01`;
