'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { asset, basePath } from '@/lib/basePath';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });
    const { data: sub } = supabase().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) setError('E-mail ou senha inválidos.');
  }

  async function signInGoogle() {
    setError(null);
    await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${basePath}/` },
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>
        Carregando…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
        <div className="card w-full max-w-sm space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset('/logo.png')} alt="Dinheiritos" className="mx-auto w-40" />
          <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>
            Planejamento e projeção financeira do casal.
          </p>
          <button
            onClick={signInGoogle}
            className="flex w-full items-center justify-center gap-2 rounded-full border py-2.5 text-sm font-semibold transition-colors"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}
          >
            <GoogleIcon /> Entrar com Google
          </button>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
            <div className="h-px flex-1" style={{ background: 'var(--line)' }} /> ou{' '}
            <div className="h-px flex-1" style={{ background: 'var(--line)' }} />
          </div>
          <form onSubmit={signIn} className="space-y-3">
            <input type="email" required placeholder="E-mail" value={email}
              onChange={(e) => setEmail(e.target.value)} className="input" />
            <input type="password" required placeholder="Senha" value={password}
              onChange={(e) => setPassword(e.target.value)} className="input" />
            {error && <p className="text-sm" style={{ color: 'var(--neg)' }}>{error}</p>}
            <button type="submit" className="btn-primary w-full justify-center">Entrar</button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
