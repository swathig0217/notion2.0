/**
 * Data export: everything a user can see, as one JSON file. The table list is checked
 * against the database (`supabase/tests/phase4.test.sql`) and the migrations
 * (`export.test.ts`) so a new table can't be silently left out.
 */

/** Exported tables, in dependency order. `push_tokens` are device ids, not user data. */
export const EXPORT_TABLES = [
  'profiles',
  'workspaces',
  'workspace_members',
  'subscriptions',
  'clients',
  'projects',
  'tasks',
  'notes',
  'inbox_items',
  'ai_actions',
  'time_entries',
  'invoices',
  'invoice_items',
  'events',
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

/** Tables deliberately not exported, with the reason. Deleted with the account all the same. */
export const NOT_EXPORTED: Record<string, string> = {
  push_tokens: 'device push tokens are credentials for this app, not user content',
};

export const EXPORT_FORMAT_VERSION = 1;

export interface ExportImage {
  path: string;
  /** Signed download link (expires; see `expires_at`). */
  url: string | null;
}

export interface ExportBundle {
  format: 'notion2-export';
  version: number;
  exported_at: string;
  tables: Record<ExportTable, unknown[]>;
  /** Note id → Markdown, for reading outside the app. */
  notes_markdown: Record<string, string>;
  images: ExportImage[];
  images_expire_at: string | null;
}

export function buildExport(args: {
  tables: Partial<Record<ExportTable, unknown[]>>;
  notesMarkdown: Record<string, string>;
  images: ExportImage[];
  imagesExpireAt: string | null;
  now?: Date;
}): ExportBundle {
  const tables = {} as Record<ExportTable, unknown[]>;
  for (const t of EXPORT_TABLES) tables[t] = args.tables[t] ?? [];
  return {
    format: 'notion2-export',
    version: EXPORT_FORMAT_VERSION,
    exported_at: (args.now ?? new Date()).toISOString(),
    tables,
    notes_markdown: args.notesMarkdown,
    images: args.images,
    images_expire_at: args.imagesExpireAt,
  };
}

/** "notion2-export-2026-10-04.json" */
export function exportFileName(now: Date = new Date()): string {
  return `notion2-export-${now.toISOString().slice(0, 10)}.json`;
}

export function exportCounts(bundle: ExportBundle): Record<ExportTable, number> {
  const out = {} as Record<ExportTable, number>;
  for (const t of EXPORT_TABLES) out[t] = bundle.tables[t].length;
  return out;
}
