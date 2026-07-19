'use client';

import { useEffect } from 'react';
import AuthGate from '@/components/AuthGate';
import Nav from '@/components/Nav';
import { GLOSSARY } from '@/lib/glossary';

function GlossaryPage() {
  // Ao chegar com uma âncora (#id), centraliza a definição na tela.
  useEffect(() => {
    const center = () => {
      const id = decodeURIComponent(window.location.hash.replace('#', ''));
      if (!id) return;
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('ring-2', 'ring-accent-500/50');
        setTimeout(() => el.classList.remove('ring-2', 'ring-accent-500/50'), 1600);
      }
    };
    center();
    window.addEventListener('hashchange', center);
    return () => window.removeEventListener('hashchange', center);
  }, []);

  return (
    <>
      <h1 className="mb-1 text-xl font-bold">Glossário</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Como cada número do Dinheiritos é calculado. Os ⓘ espalhados pelo app apontam para cá.
      </p>
      <div className="space-y-4">
        {GLOSSARY.map((e) => (
          <section key={e.id} id={e.id} className="card scroll-mt-[40vh] transition-shadow">
            <h2 className="font-semibold">{e.term}</h2>
            <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600 dark:bg-navy-900 dark:text-slate-300">
              {e.formula}
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{e.desc}</p>
          </section>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-3xl p-4 md:p-8">
        <Nav />
        <GlossaryPage />
      </main>
    </AuthGate>
  );
}
