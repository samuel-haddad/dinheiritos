// Aritmética de meses sobre strings 'YYYY-MM-01' (sem Date/fuso).
import type { Month } from '../types';

export function toMonth(dateStr: string): Month {
  return dateStr.slice(0, 7) + '-01';
}

export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

/** Diferença m2 - m1 em meses. */
export function diffMonths(m1: Month, m2: Month): number {
  const [y1, mo1] = m1.split('-').map(Number);
  const [y2, mo2] = m2.split('-').map(Number);
  return (y2 - y1) * 12 + (mo2 - mo1);
}

/** month está em [start, end]? end null = sem limite. */
export function inRange(month: Month, start: Month, end: Month | null): boolean {
  return month >= start && (end === null || month <= end);
}

/** Sequência de `count` meses a partir de start (inclusive). */
export function monthRange(start: Month, count: number): Month[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

export function formatMonth(month: Month): string {
  const [y, m] = month.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(m) - 1]}/${y.slice(2)}`;
}
