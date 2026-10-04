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

/**
 * A privileged client for server-to-server endpoints (webhooks, cron). Bypasses RLS:
 * every query MUST be scoped to a workspace or user explicitly.
 */
export function serviceClient(): Db {
  return createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
