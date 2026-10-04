import type { JSONContent } from '@tiptap/core';
import { docToMarkdown } from '@notion2/editor';
import {
  EXPORT_TABLES,
  buildExport,
  exportFileName,
  type ExportBundle,
  type ExportImage,
  type ExportTable,
} from '@notion2/shared';
import { supabase } from '@/lib/supabase';
import { saveTextFile } from './save-file';

const PAGE = 1000;
const IMAGE_LINK_SECONDS = 7 * 24 * 60 * 60;

async function fetchAll(table: ExportTable): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    // RLS limits every table to what this user can see.
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) return rows;
  }
}

async function imageLinks(workspaceId: string): Promise<ExportImage[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from('inbox')
      .list(workspaceId, { limit: PAGE, offset });
    if (error) throw error;
    paths.push(...data.map((f) => `${workspaceId}/${f.name}`));
    if (data.length < PAGE) break;
  }
  if (paths.length === 0) return [];
  const { data, error } = await supabase.storage
    .from('inbox')
    .createSignedUrls(paths, IMAGE_LINK_SECONDS);
  if (error) throw error;
  return paths.map((path, i) => ({ path, url: data[i]?.signedUrl ?? null }));
}

/** Everything the user can see, as one JSON bundle (format in packages/shared/src/export). */
export async function buildDataExport(workspaceId: string): Promise<ExportBundle> {
  const tables: Partial<Record<ExportTable, unknown[]>> = {};
  for (const t of EXPORT_TABLES) tables[t] = await fetchAll(t);
  const notesMarkdown: Record<string, string> = {};
  for (const n of (tables.notes ?? []) as { id: string; content: unknown }[]) {
    notesMarkdown[n.id] = docToMarkdown(n.content as JSONContent | null);
  }
  const now = new Date();
  const images = await imageLinks(workspaceId);
  return buildExport({
    tables,
    notesMarkdown,
    images,
    imagesExpireAt: images.length
      ? new Date(now.getTime() + IMAGE_LINK_SECONDS * 1000).toISOString()
      : null,
    now,
  });
}

/** Builds the export and hands it to the platform (download on web, share/save on phones). */
export async function exportData(workspaceId: string): Promise<ExportBundle> {
  const bundle = await buildDataExport(workspaceId);
  await saveTextFile(exportFileName(), JSON.stringify(bundle, null, 2), 'application/json');
  return bundle;
}
