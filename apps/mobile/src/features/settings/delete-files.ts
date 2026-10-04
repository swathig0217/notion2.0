import { supabase } from '@/lib/supabase';

/**
 * Deletes every uploaded inbox image for the workspace. Database rows cascade on account
 * deletion, but Storage files don't, so this runs first.
 */
export async function deleteWorkspaceFiles(workspaceId: string): Promise<void> {
  for (;;) {
    const { data, error } = await supabase.storage.from('inbox').list(workspaceId, { limit: 100 });
    if (error) throw error;
    if (!data || data.length === 0) return;
    const { error: removeError } = await supabase.storage
      .from('inbox')
      .remove(data.map((f) => `${workspaceId}/${f.name}`));
    if (removeError) throw removeError;
  }
}
