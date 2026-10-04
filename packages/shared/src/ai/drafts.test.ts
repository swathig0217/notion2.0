import { describe, expect, it } from 'vitest';
import { buildDraftContext, fallbackDraft, renderDraftMessage, sanitizeDraft } from './drafts.ts';

const ctx = buildDraftContext({
  today: '2026-10-05',
  senderName: 'Jordan',
  tone: 'Warm and brief',
  client: {
    name: 'Acme Co',
    email: 'sam.lee@acme.example',
    last_contacted_at: '2026-09-28T10:00:00Z',
  },
  project: { title: 'Website refresh', due_date: '2026-10-30' },
  tasks: [
    {
      title: 'Homepage mockups',
      status: 'done',
      due_date: null,
      completed_at: '2026-10-02T12:00:00Z',
      parent_task_id: null,
    },
    {
      title: 'Old thing',
      status: 'done',
      due_date: null,
      completed_at: '2026-09-01T12:00:00Z',
      parent_task_id: null,
    },
    {
      title: 'Subtask',
      status: 'done',
      due_date: null,
      completed_at: '2026-10-03T12:00:00Z',
      parent_task_id: 'p',
    },
    {
      title: 'Pricing page',
      status: 'doing',
      due_date: '2026-10-08',
      completed_at: null,
      parent_task_id: null,
    },
    { title: 'FAQ copy', status: 'todo', due_date: null, completed_at: null, parent_task_id: null },
  ],
  notes: [{ title: 'Kickoff', content_text: 'Budget approved: $4,000 for 6 pages' }],
  minutesLogged: 245,
  since: '2026-09-28T10:00:00Z',
});

describe('buildDraftContext', () => {
  it('splits work into completed since last contact, in progress and upcoming', () => {
    expect(ctx.completed).toEqual([{ title: 'Homepage mockups', completed_on: '2026-10-02' }]);
    expect(ctx.in_progress.map((t) => t.title)).toEqual(['Pricing page']);
    expect(ctx.upcoming.map((t) => t.title)).toEqual(['FAQ copy']);
    expect(ctx.client.contact_first_name).toBe('Sam');
    expect(ctx.minutes_logged).toBe(245);
  });

  it('renders the context inside delimiters with days since contact', () => {
    const msg = renderDraftMessage('follow_up', ctx);
    expect(msg).toContain('Last contact with this client was 7 days ago.');
    expect(msg).toContain('<work_context>');
  });
});

describe('sanitizeDraft', () => {
  it('rejects money amounts not in the context', () => {
    const issues: string[] = [];
    expect(
      typeof sanitizeDraft({ subject: 'x', body: 'That will be $2,500 extra.' }, ctx, issues),
    ).toBe('string');
    expect(issues).toEqual(['invented_amount']);
  });
  it('allows amounts that appear in the context', () => {
    expect(sanitizeDraft({ subject: 'x', body: 'Within the $4,000 budget.' }, ctx, [])).toEqual({
      subject: 'x',
      body: 'Within the $4,000 budget.',
    });
  });
  it('rejects empty bodies and fills an empty subject', () => {
    expect(typeof sanitizeDraft({ subject: 's', body: '  ' }, ctx, [])).toBe('string');
    expect(sanitizeDraft({ subject: '', body: 'Hi' }, ctx, [])).toEqual({
      subject: 'Quick update',
      body: 'Hi',
    });
  });
});

describe('fallbackDraft', () => {
  it('lists real work only and signs with the sender name', () => {
    const d = fallbackDraft('client_update', ctx);
    expect(d.subject).toBe('Update: Website refresh');
    expect(d.body).toContain('Hi Sam,');
    expect(d.body).toContain('- Homepage mockups');
    expect(d.body).toContain('- Pricing page');
    expect(d.body).not.toContain('Old thing');
    expect(d.body.endsWith('Jordan')).toBe(true);
  });
  it('writes a short check-in for follow-ups', () => {
    expect(fallbackDraft('follow_up', ctx).body).toContain('Just checking in on Website refresh');
  });
});
