import { addDays } from '../dates/dates.ts';
import type { AiProposal, OnboardingAnswers, ProposedChange } from './schemas.ts';

/**
 * Deterministic starter workspaces. Used when the AI is slow or unavailable during
 * onboarding, so a new user always ends the first session with a working system.
 */

type Kind = 'design' | 'dev' | 'consulting' | 'coaching' | 'video' | 'agency' | 'va' | 'other';

interface Template {
  clients: [string, string];
  project: string;
  tasks: { title: string; inDays: number | null; subtasks?: string[]; priority?: 'high' | 'med' }[];
}

const TEMPLATES: Record<Kind, Template> = {
  design: {
    clients: ['Northwind Bakery (sample)', 'Bolt Fitness (sample)'],
    project: 'Brand refresh',
    tasks: [
      { title: 'Kickoff call: goals and audience', inDays: 0, priority: 'high' },
      {
        title: 'Moodboard and references',
        inDays: 2,
        subtasks: ['Collect references', 'Pick 3 directions'],
      },
      { title: 'First logo concepts', inDays: 7 },
      { title: 'Send invoice for deposit', inDays: 1, priority: 'med' },
    ],
  },
  dev: {
    clients: ['Acme Retail (sample)', 'Lumen Health (sample)'],
    project: 'Website rebuild',
    tasks: [
      { title: 'Confirm scope and milestones', inDays: 0, priority: 'high' },
      {
        title: 'Set up repo and staging',
        inDays: 2,
        subtasks: ['Create repo', 'Deploy staging', 'Share access'],
      },
      { title: 'Build first page', inDays: 7 },
      { title: 'Weekly status update', inDays: 4, priority: 'med' },
    ],
  },
  consulting: {
    clients: ['Harbor Logistics (sample)', 'Peak Advisors (sample)'],
    project: 'Discovery engagement',
    tasks: [
      {
        title: 'Stakeholder interviews',
        inDays: 0,
        priority: 'high',
        subtasks: ['Schedule 3 interviews', 'Prepare questions'],
      },
      { title: 'Draft findings deck', inDays: 7 },
      { title: 'Send proposal for phase 2', inDays: 10, priority: 'med' },
      { title: 'Invoice discovery phase', inDays: 3 },
    ],
  },
  coaching: {
    clients: ['Jamie Rivera (sample)', 'Sam Chen (sample)'],
    project: '12-week program',
    tasks: [
      { title: 'Prep session notes', inDays: 0, priority: 'high' },
      { title: 'Send session recap and homework', inDays: 1 },
      { title: 'Check in mid-week', inDays: 3 },
      { title: 'Renewal conversation', inDays: 14, priority: 'med' },
    ],
  },
  video: {
    clients: ['Fable Studios (sample)', 'Orbit Coffee (sample)'],
    project: 'Product launch video',
    tasks: [
      {
        title: 'Collect footage and assets',
        inDays: 0,
        priority: 'high',
        subtasks: ['Request raw footage', 'Get logo and fonts'],
      },
      { title: 'Rough cut', inDays: 5 },
      { title: 'Client review round 1', inDays: 7 },
      { title: 'Invoice deposit', inDays: 1, priority: 'med' },
    ],
  },
  agency: {
    clients: ['Greenline Foods (sample)', 'Atlas Travel (sample)'],
    project: 'Q4 campaign',
    tasks: [
      { title: 'Campaign brief sign-off', inDays: 0, priority: 'high' },
      { title: 'Assign work to the team', inDays: 1, subtasks: ['Design', 'Copy', 'Ads setup'] },
      { title: 'Weekly client update', inDays: 4 },
      { title: 'Monthly invoice', inDays: 7, priority: 'med' },
    ],
  },
  va: {
    clients: ['Morgan Lee (sample)', 'Riverside Dental (sample)'],
    project: 'Inbox and calendar',
    tasks: [
      { title: 'Inbox triage', inDays: 0, priority: 'high' },
      { title: 'Book next week’s meetings', inDays: 1 },
      { title: 'Send weekly summary', inDays: 4 },
      { title: 'Log hours for invoice', inDays: 5, priority: 'med' },
    ],
  },
  other: {
    clients: ['First Client (sample)', 'Second Client (sample)'],
    project: 'First project',
    tasks: [
      { title: 'Kickoff call', inDays: 0, priority: 'high' },
      { title: 'Send proposal', inDays: 2 },
      { title: 'Weekly status update', inDays: 4 },
      { title: 'Send invoice', inDays: 7, priority: 'med' },
    ],
  },
};

const KEYWORDS: [Kind, RegExp][] = [
  ['design', /design|brand|illustrat|ux|ui\b|graphic/i],
  ['dev', /develop|engineer|code|software|web|app/i],
  ['video', /video|edit|film|motion|photo/i],
  ['coaching', /coach|therap|train|mentor/i],
  ['consulting', /consult|advis|strateg|account|bookkeep|legal|lawyer/i],
  ['agency', /agency|studio|marketing/i],
  ['va', /assistant|\bva\b|admin|operations/i],
];

export function businessKind(businessType: string): Kind {
  return KEYWORDS.find(([, re]) => re.test(businessType))?.[0] ?? 'other';
}

export function starterTemplate(answers: OnboardingAnswers, today: string): AiProposal {
  const t =
    TEMPLATES[businessKind(`${answers.business_type} ${answers.business_description ?? ''}`)];
  const changes: ProposedChange[] = [
    { op: 'create_client', ref: 'c1', name: t.clients[0], email: null },
    { op: 'create_client', ref: 'c2', name: t.clients[1], email: null },
    {
      op: 'create_project',
      ref: 'p1',
      title: t.project,
      client_id: 'c1',
      due_date: addDays(today, 30),
    },
  ];
  t.tasks.forEach((task, i) =>
    changes.push({
      op: 'create_task',
      ref: `t${i + 1}`,
      title: task.title,
      notes: null,
      client_id: i === t.tasks.length - 1 ? 'c2' : 'c1',
      project_id: i === t.tasks.length - 1 ? null : 'p1',
      due_date: task.inDays == null ? null : addDays(today, task.inDays),
      priority: task.priority ?? 'none',
      subtasks: task.subtasks ?? [],
    }),
  );
  return {
    summary:
      'A starter workspace with two sample clients, a project and a few tasks. Edit or delete anything.',
    proposed_changes: changes,
    questions: [],
    confidence: 1,
  };
}
