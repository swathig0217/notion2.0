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

describe('draft and brief assertions', () => {
  it('checks drafts', async () => {
    const { checkDraft } = await import('./assertions.ts');
    const d = {
      subject: 'Update',
      body: 'Hi Sam,\n\nHomepage is done and FAQ is next.\n\nBest,\nJordan',
    };
    expect(
      checkDraft(d, {
        greets: 'Sam',
        signs: 'Jordan',
        mentions_all: ['faq'],
        max_words: 50,
        no_amounts: true,
      }),
    ).toEqual([]);
    expect(checkDraft({ ...d, body: d.body + ' That is $500.' }, { no_amounts: true })).toEqual([
      'invented a money amount',
    ]);
    expect(checkDraft({ ...d, body: 'Hi, see you Oct 20.' }, { no_dates_except: [] })).toEqual([
      'mentions dates not in context: Oct 20',
    ]);
  });
  it('checks briefs', async () => {
    const { checkBrief } = await import('./assertions.ts');
    const b = {
      headline: 'Calm week',
      priorities: [{ task_id: 'a' }, { task_id: 'b' }],
      follow_ups: [{ client_id: 'x' }],
    };
    expect(
      checkBrief(b, {
        first_priority_in: ['a'],
        includes: ['b'],
        follow_ups_include: ['x'],
        max_priorities: 5,
      }),
    ).toEqual([]);
    expect(
      checkBrief(b, {
        first_priority_in: ['b'],
        excludes: ['a'],
        headline_must_not_contain: ['calm'],
      }),
    ).toHaveLength(3);
  });
});
