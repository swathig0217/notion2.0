import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@notion2/shared';
import { keys } from '@/lib/collection';
import { supabase } from '@/lib/supabase';
import { useSession } from './session';

export interface Me {
  userId: string;
  email: string | null;
  profile: Tables<'profiles'>;
  workspace: Tables<'workspaces'>;
}

export function useMe() {
  const { session } = useSession();
  return useQuery({
    queryKey: keys.me,
    enabled: session != null,
    queryFn: async (): Promise<Me> => {
      const user = session?.user;
      if (!user) throw new Error('Not signed in');
      const [profile, workspace] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('workspaces').select('*').order('created_at').limit(1).single(),
      ]);
      if (profile.error) throw profile.error;
      if (workspace.error) throw workspace.error;
      return {
        userId: user.id,
        email: user.email ?? null,
        profile: profile.data,
        workspace: workspace.data,
      };
    },
  });
}

/** The current workspace id; components below the auth gate can rely on it once loaded. */
export function useWorkspaceId(): string | undefined {
  return useMe().data?.workspace.id;
}

/** The user's IANA timezone (profile setting, falling back to the device zone). */
export function useTimeZone(): string {
  const me = useMe().data;
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return me && me.profile.timezone !== 'UTC' ? me.profile.timezone : device;
}
