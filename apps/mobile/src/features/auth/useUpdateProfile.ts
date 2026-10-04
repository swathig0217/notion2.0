import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TablesUpdate } from '@notion2/shared';
import { keys } from '@/lib/collection';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import type { Me } from './useMe';

type ProfilePatch = Pick<
  TablesUpdate<'profiles'>,
  'display_name' | 'tone' | 'timezone' | 'notification_prefs'
>;

/** Optimistic profile update (settings). Reverts the cache if the server rejects it. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useCallback(
    async (patch: ProfilePatch) => {
      const before = qc.getQueryData<Me>(keys.me);
      if (!before) return false;
      qc.setQueryData<Me>(keys.me, {
        ...before,
        profile: { ...before.profile, ...patch } as Me['profile'],
      });
      const { error } = await supabase.from('profiles').update(patch).eq('id', before.userId);
      if (error) {
        qc.setQueryData<Me>(keys.me, before);
        toast.error('Couldn’t save that setting.');
        return false;
      }
      return true;
    },
    [qc],
  );
}
