import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isValidTimeZone } from '@notion2/shared';
import { keys } from '@/lib/collection';
import { supabase } from '@/lib/supabase';
import { useMe, type Me } from './useMe';

/**
 * New profiles default to UTC. On first launch, adopt the device timezone so "today"
 * and "overdue" match the user's wall clock. Users can change it in Settings.
 */
export function useSyncTimeZone() {
  const qc = useQueryClient();
  const me = useMe().data;
  useEffect(() => {
    if (!me || me.profile.timezone !== 'UTC') return;
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!device || device === 'UTC' || !isValidTimeZone(device)) return;
    qc.setQueryData<Me>(keys.me, (m) =>
      m ? { ...m, profile: { ...m.profile, timezone: device } } : m,
    );
    void supabase.from('profiles').update({ timezone: device }).eq('id', me.userId);
  }, [me, qc]);
}
