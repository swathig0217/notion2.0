// Test-only: reads the SQL migrations from disk (the module itself stays runtime-agnostic).
/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXPORT_TABLES,
  NOT_EXPORTED,
  buildExport,
  exportCounts,
  exportFileName,
} from './export.ts';

const dir = new URL('../../../../supabase/migrations/', import.meta.url);
const tables = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .flatMap((f) => [
    ...readFileSync(new URL(f, dir), 'utf8').matchAll(/create table public\.(\w+)/g),
  ])
  .map((m) => m[1]);

describe('export', () => {
  it('covers every table created by a migration', () => {
    expect(tables.length).toBeGreaterThan(10);
    for (const t of tables) {
      expect(
        (EXPORT_TABLES as readonly string[]).includes(t ?? '') || (t ?? '') in NOT_EXPORTED,
        `table ${t} is neither exported nor listed in NOT_EXPORTED`,
      ).toBe(true);
    }
  });

  it('builds a complete bundle with every table present', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const bundle = buildExport({
      tables: { clients: [{ id: 'c1' }], tasks: [{ id: 't1' }, { id: 't2' }] },
      notesMarkdown: { n1: '# Hi' },
      images: [],
      imagesExpireAt: null,
      now,
    });
    expect(Object.keys(bundle.tables)).toEqual([...EXPORT_TABLES]);
    expect(exportCounts(bundle)).toMatchObject({ clients: 1, tasks: 2, notes: 0 });
    expect(bundle.exported_at).toBe('2026-10-04T12:00:00.000Z');
    expect(exportFileName(now)).toBe('notion2-export-2026-10-04.json');
  });
});
