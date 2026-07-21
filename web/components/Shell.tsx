'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { profileName, useProfiles } from '@/lib/useProfiles';
import ThemeToggle from './ThemeToggle';

const LINKS = [
  {
    href: '/',
    label: 'Projeção',
    subtitle: 'Saldo livre e patrimônio projetados para os próximos 24 meses.',
    icon: (
      <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3v-5H7v5H4a1 1 0 0 1-1-1V8.5Z" strokeWidth="1.6" strokeLinejoin="round" />
    ),
  },
  {
    href: '/analises/',
    label: 'Análises',
    subtitle: 'Receita, despesa, composição e acumulados do período projetado.',
    icon: <path d="M4 16V9M10 16V4M16 16v-5" strokeWidth="1.8" strokeLinecap="round" />,
  },
  {
    href: '/lancamentos/',
    label: 'Lançamentos',
    subtitle: 'Receitas e despesas recorrentes, pontuais e parceladas.',
    icon: <path d="M4 6h12M4 10h12M4 14h8" strokeWidth="1.7" strokeLinecap="round" />,
  },
  {
    href: '/contas/',
    label: 'Contas',
    subtitle: 'Saldo atual de cada conta bancária.',
    icon: (
      <>
        <path d="M3 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeWidth="1.5" />
        <circle cx="13.5" cy="10.5" r="1.3" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    href: '/cartoes/',
    label: 'Cartões',
    subtitle: 'Cartões de crédito e fatura atual.',
    icon: (
      <>
        <rect x="3" y="5" width="14" height="10" rx="2" strokeWidth="1.5" />
        <path d="M3 8.5h14" strokeWidth="1.5" />
      </>
    ),
  },
  {
    href: '/investimentos/',
    label: 'Investimentos',
    subtitle: 'Posições e evolução do patrimônio investido.',
    icon: (
      <>
        <path d="M4 13l3.5-3.5 2.5 2.5L16 6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12.5 6H16v3.5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    href: '/metas/',
    label: 'Metas',
    subtitle: 'Prazo, valor-alvo e aporte mensal necessário de cada meta.',
    icon: (
      <path
        d="M10 2.5l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4L5.5 19l.9-5L2.8 7.7l5-.7L10 2.5Z"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: '/glossario/',
    label: 'Glossário',
    subtitle: 'Como cada número da projeção é calculado.',
    icon: (
      <>
        <path d="M5 4.5h8v13H7a2 2 0 0 0-2 2V4.5Z" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 8h4M8 11h3" strokeWidth="1.4" strokeLinecap="round" />
      </>
    ),
  },
];

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <rect width="34" height="34" rx="11" fill="var(--accent)" />
      <path d="M17 25V15.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M17 15.5c-.4-3 -2.6-4.4 -5-4.4 .2 3 2.3 4.4 5 4.4Z" fill="#fff" />
      <path d="M17 17.4c.4-2.6 2.4-3.8 4.6-3.8 -.2 2.7 -2.1 3.8 -4.6 3.8Z" fill="#8FD3C2" />
    </svg>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const profiles = useProfiles();
  const current = LINKS.find((l) => path === l.href || path === l.href.replace(/\/$/, '')) ?? LINKS[0];
  const [menuOpen, setMenuOpen] = useState(false);

  const p1 = profiles[0] ? profileName(profiles, profiles[0].id) : 'Samuel';
  const p2 = profiles[1] ? profileName(profiles, profiles[1].id) : 'Ivana';

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Backdrop for mobile drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[250px] flex-none flex-col border-r px-5 py-7 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
      >
        <div className="flex items-center gap-[11px] px-1.5 pb-[30px] pt-1">
          <Logo />
          <span className="font-display text-[20px] font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
            Dinheiritos
          </span>
          <button
            onClick={() => setMenuOpen(false)}
            className="ml-auto rounded-lg p-1.5 md:hidden"
            style={{ color: 'var(--muted)' }}
            aria-label="Fechar menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path d="M5 5l10 10M15 5L5 15" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-[3px] overflow-y-auto">
          {LINKS.map((l) => {
            const active = l.href === current.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
                style={{
                  background: active ? 'var(--nav-active-bg)' : 'transparent',
                  color: active ? 'var(--accent-strong)' : 'var(--muted)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                  {l.icon}
                </svg>
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 border-t pt-[18px]" style={{ borderColor: 'var(--line)' }}>
          <div className="flex">
            <span
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 text-xs font-bold text-white"
              style={{ background: 'var(--accent)', borderColor: 'var(--bg)' }}
            >
              {p1.charAt(0).toUpperCase()}
            </span>
            <span
              className="-ml-[9px] flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 text-xs font-bold text-white"
              style={{ background: 'var(--chart-3)', borderColor: 'var(--bg)' }}
            >
              {p2.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-[13px] font-medium" style={{ color: 'var(--muted)' }}>
            {p1} &amp; {p2}
          </span>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="flex max-w-[1100px] flex-wrap items-center gap-3 px-5 pb-2 pt-[20px] md:flex-nowrap md:items-start md:gap-5 md:px-10 md:pt-[34px]">
          <button
            onClick={() => setMenuOpen(true)}
            className="flex-none rounded-lg p-1.5 md:hidden"
            style={{ color: 'var(--ink)' }}
            aria-label="Abrir menu"
          >
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path d="M3 5.5h14M3 10h14M3 14.5h14" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          <div className="min-w-[140px] flex-1">
            <h1 className="font-display m-0 text-[24px] font-bold tracking-tight md:text-[32px]" style={{ color: 'var(--ink)' }}>
              {current.label}
            </h1>
            <p className="m-0 mt-1.5 hidden text-[14.5px] md:block md:max-w-[640px]" style={{ color: 'var(--muted)' }}>
              {current.subtitle}
            </p>
          </div>

          <div className="flex flex-none items-center gap-2 md:mt-1">
            <ThemeToggle />
            <button
              onClick={() => supabase().auth.signOut()}
              className="btn-secondary"
              title="Sair"
            >
              Sair
            </button>
          </div>

          <p className="m-0 w-full text-[14.5px] md:hidden" style={{ color: 'var(--muted)' }}>
            {current.subtitle}
          </p>
        </header>

        <div className="max-w-[1100px] px-5 pb-[90px] pt-6 md:px-10">{children}</div>
      </main>
    </div>
  );
}
