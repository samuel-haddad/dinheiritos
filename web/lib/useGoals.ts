'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Goal } from './types';

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  useEffect(() => {
    supabase()
      .from('goals')
      .select('*')
      .order('name')
      .then(({ data }) => setGoals((data as Goal[]) ?? []));
  }, []);
  return goals;
}

export function goalName(goals: Goal[], id: string | null): string {
  return goals.find((g) => g.id === id)?.name ?? '—';
}
