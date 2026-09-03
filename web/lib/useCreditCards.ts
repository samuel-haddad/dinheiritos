'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { CreditCard } from './types';

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  useEffect(() => {
    supabase()
      .from('credit_cards')
      .select('*')
      .order('name')
      .then(({ data }) => setCards((data as CreditCard[]) ?? []));
  }, []);
  return cards;
}

export function creditCardName(cards: CreditCard[], id: string | null): string {
  return cards.find((c) => c.id === id)?.name ?? '—';
}
