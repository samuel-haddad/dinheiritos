'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { asset } from '@/lib/basePath';
import ThemeToggle from './ThemeToggle';

const links = [
  { href: '/', label: 'Projeção' },
  { href: '/analises/', label: 'Análises' },
  { href: '/lancamentos/', label: 'Lançamentos' },
  { href: '/contas/', label: 'Contas' },
  { href: '/cartoes/', label: 'Cartões' },
  { href: '/investimentos/', label: 'Investimentos' },
  { href: '/metas/', label: 'Metas' },
  { href: '/glossario/', label: 'Glossário' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1 border-b border-slate-200 pb-3 dark:border-navy-700">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset('/logo.png')} alt="Dinheiritos" className="mr-3 h-9 w-9 rounded-lg object-cover" />
      {links.map((l) => {
        const active = path === l.href || path === l.href.replace(/\/$/, '');
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              active
                ? 'bg-accent-600/10 text-accent-600 dark:bg-accent-500/15 dark:text-accent-400'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-700'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <button onClick={() => supabase().auth.signOut()} className="btn-ghost">
          Sair
        </button>
      </div>
    </nav>
  );
}
