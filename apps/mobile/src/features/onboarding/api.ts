import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '@/lib/collection';
import { supabase } from '@/lib/supabase';
import type { Me } from '@/features/auth/useMe';

/** Marks onboarding done (and saves what they do). Flips the router guard to the app. */
export function useFinishOnboarding() {
  const qc = useQueryClient();
  return useCallback(
    async (businessType: string | null) => {
      const me = qc.getQueryData<Me>(keys.me);
      if (!me) return;
      const patch = {
        onboarded_at: new Date().toISOString(),
        ...(businessType ? { business_type: businessType } : {}),
      };
      const { error } = await supabase.from('profiles').update(patch).eq('id', me.userId);
      if (error) throw error;
      qc.setQueryData<Me>(keys.me, (m) => (m ? { ...m, profile: { ...m.profile, ...patch } } : m));
    },
    [qc],
  );
}
