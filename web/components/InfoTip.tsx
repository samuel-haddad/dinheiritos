'use client';

// ⓘ com definição flutuante no hover; clique leva ao glossário (definição centralizada).
import { useState } from 'react';
import Link from 'next/link';
import { glossaryById } from '@/lib/glossary';

export default function InfoTip({ g, className }: { g: string | string[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ids = Array.isArray(g) ? g : [g];
  const entries = ids.map(glossaryById).filter((e): e is NonNullable<typeof e> => Boolean(e));
  if (entries.length === 0) return null;

  return (
    <span
      className="relative inline-block align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href={`/glossario/#${entries[0].id}`}
        className={`text-slate-300 hover:text-accent-500 ${className ?? ''}`}
        aria-label={`Ver "${entries[0].term}" no glossário`}
      >
        ⓘ
      </Link>
      {open && (
        <span className="absolute left-1/2 top-full z-50 mt-1 block w-72 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case tracking-normal shadow-lg dark:border-navy-700 dark:bg-navy-800">
          {entries.map((e) => (
            <span key={e.id} className="mb-2 block last:mb-0">
              <span className="block font-semibold text-slate-700 dark:text-slate-100">{e.term}</span>
              <span className="mt-0.5 block font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {e.formula}
              </span>
              <span className="mt-1 block text-slate-600 dark:text-slate-300">{e.desc}</span>
            </span>
          ))}
          <span className="mt-1 block text-accent-600 dark:text-accent-400">Clique para abrir no glossário →</span>
        </span>
      )}
    </span>
  );
}
