import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '@/lib/collection';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { Me } from '@/features/auth/useMe';

export function inboundAddress(token: string | null | undefined): string | null {
  if (!token || !env.inboundEmailDomain) return null;
  return `${token}@${env.inboundEmailDomain}`;
}

/** Issues a new forwarding address; the old one stops working immediately. */
export function useRegenerateInbound() {
  const qc = useQueryClient();
  return useCallback(async () => {
    const me = qc.getQueryData<Me>(keys.me);
    if (!me) return null;
    const { data, error } = await supabase.rpc('regenerate_inbound_token', {
      p_workspace_id: me.workspace.id,
    });
    if (error) throw error;
    qc.setQueryData<Me>(keys.me, (m) =>
      m ? { ...m, workspace: { ...m.workspace, inbound_token: data } } : m,
    );
    return data;
  }, [qc]);
}
