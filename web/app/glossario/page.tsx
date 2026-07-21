'use client';

import { useEffect, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import Shell from '@/components/Shell';
import { GLOSSARY } from '@/lib/glossary';

function GlossaryPage() {
  const [query, setQuery] = useState('');

  // Ao chegar com uma âncora (#id), centraliza a definição na tela.
  useEffect(() => {
    const center = () => {
      const id = decodeURIComponent(window.location.hash.replace('#', ''));
      if (!id) return;
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('ring-2', 'ring-[var(--accent)]');
        setTimeout(() => el.classList.remove('ring-2', 'ring-[var(--accent)]'), 1600);
      }
    };
    center();
    window.addEventListener('hashchange', center);
    return () => window.removeEventListener('hashchange', center);
  }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? GLOSSARY.filter((e) => e.term.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q))
    : GLOSSARY;

  return (
    <>
      <div className="mb-6 max-w-[380px]">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar termo…"
          className="input !rounded-2xl"
        />
      </div>
      <div className="flex flex-col gap-3.5">
        {results.map((e) => (
          <section
            key={e.id}
            id={e.id}
            className="card scroll-mt-[40vh] transition-shadow"
            style={{ boxShadow: '0 1px 2px var(--shadow-sm), 0 8px 24px -14px var(--shadow-lg)' }}
          >
            <p className="font-display m-0 mb-1 font-semibold" style={{ color: 'var(--ink)' }}>{e.term}</p>
            <p className="m-0 mb-2 font-mono text-[12.5px]" style={{ color: 'var(--accent-strong)' }}>
              {e.formula}
            </p>
            <p className="m-0 text-[13.5px]" style={{ color: 'var(--muted)' }}>{e.desc}</p>
          </section>
        ))}
        {results.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Nenhum termo encontrado para &quot;{query}&quot;.</p>
        )}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Shell>
        <GlossaryPage />
      </Shell>
    </AuthGate>
  );
}
