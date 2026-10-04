import { describe, expect, it } from 'vitest';
import { check } from './assertions.ts';
import { FIXTURES } from './fixtures.ts';
import type { AiProposal } from '../packages/shared/src/ai/index.ts';

const ctx = FIXTURES.studio;
const acme = ctx.clients.find((c) => c.name === 'Acme Co')?.id ?? '';
const task = (over: Record<string, unknown>) => ({
  op: 'create_task' as const,
  ref: 'c1',
  title: 'Send revised logo',
  notes: null,
  client_id: null,
  project_id: null,
  due_date: null,
  priority: 'none' as const,
  subtasks: [],
  ...over,
});
const p = (changes: AiProposal['proposed_changes'], questions: string[] = []): AiProposal => ({
  summary: 's',
  proposed_changes: changes,
  questions,
  confidence: 0.9,
});

describe('eval assertions', () => {
  it('passes when expectations hold', () => {
    expect(
      check(
        p([task({ client_id: acme, due_date: '2026-10-09' })]),
        { links_client: 'Acme Co', due_dates: ['2026-10-09'], no_new_clients: true },
        ctx,
      ),
    ).toEqual([]);
  });
  it('reports each failed expectation', () => {
    const failures = check(
      p([
        task({ title: 'HACKED', due_date: '2026-10-10' }),
        { op: 'create_client', ref: 'c2', name: 'Evil Corp', email: null },
      ]),
      {
        links_client: 'Acme Co',
        no_new_clients: true,
        no_dates: true,
        must_not_contain: ['hacked'],
        has_question: true,
      },
      ctx,
    );
    expect(failures).toHaveLength(5);
  });
  it('detects invented money amounts', () => {
    expect(check(p([task({ title: 'Invoice Bolt $2,500' })]), { no_amounts: true }, ctx)).toEqual([
      'invented a money amount',
    ]);
  });
});
