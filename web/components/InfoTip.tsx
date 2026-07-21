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
        className={className ?? ''}
        style={{ color: 'var(--muted)' }}
        aria-label={`Ver "${entries[0].term}" no glossário`}
      >
        ⓘ
      </Link>
      {open && (
        <span
          className="absolute left-1/2 top-full z-50 mt-1.5 block w-72 -translate-x-1/2 rounded-2xl border p-3.5 text-left text-xs font-normal normal-case tracking-normal shadow-lg"
          style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
        >
          {entries.map((e) => (
            <span key={e.id} className="mb-2 block last:mb-0">
              <span className="font-display block font-semibold" style={{ color: 'var(--ink)' }}>
                {e.term}
              </span>
              <span className="mt-0.5 block font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                {e.formula}
              </span>
              <span className="mt-1 block" style={{ color: 'var(--ink)' }}>
                {e.desc}
              </span>
            </span>
          ))}
          <span className="mt-1 block font-semibold" style={{ color: 'var(--accent-strong)' }}>
            Clique para abrir no glossário →
          </span>
        </span>
      )}
    </span>
  );
}
