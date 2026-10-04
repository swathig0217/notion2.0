import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../packages/shared/src/db.types.ts';

export type Db = SupabaseClient<Database>;

/** A client acting as the caller: every query goes through RLS. */
export function userClient(req: Request): Db {
  return createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
