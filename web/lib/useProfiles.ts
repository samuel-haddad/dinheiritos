'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Profile } from './types';

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  useEffect(() => {
    supabase()
      .from('profiles')
      .select('*')
      .order('name')
      .then(({ data }) => setProfiles((data as Profile[]) ?? []));
  }, []);
  return profiles;
}

export function profileName(profiles: Profile[], id: string | null): string {
  return profiles.find((p) => p.id === id)?.name ?? '—';
}
