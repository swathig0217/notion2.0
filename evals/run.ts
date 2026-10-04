/**
 * AI eval runner.
 *
 *   pnpm eval                 live: all suites against Claude (needs ANTHROPIC_API_KEY)
 *   pnpm eval --dry           offline: validates cases and renders every prompt, no API calls
 *   pnpm eval --suite brief   one suite: inbox | drafts | brief
 *   pnpm eval --only acme --threshold 0.9 --concurrency 4
 *
 * Live runs use the exact production path for each feature: the same prompt files,
 * rendering, Claude adapter, retry/fallback and guardrails as the edge functions.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  DraftMessage,
  WeeklyBrief,
  buildBriefData,
  fallbackBrief,
  fallbackDraft,
  fallbackProposal,
  renderBriefMessage,
  renderDraftMessage,
  renderInboxMessage,
  runProposal,
  runStructured,
  sanitizeBrief,
  sanitizeDraft,
  type DraftContext,
  type ModelCall,
} from '../packages/shared/src/ai/index.ts';
import { createClaudeCall, DEFAULT_MODEL } from '../supabase/functions/_shared/claude.ts';
import {
  BriefExpectation,
  DraftExpectation,
  Expectation,
  check,
  checkBrief,
  checkDraft,
} from './assertions.ts';
import { FIXTURES } from './fixtures.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PROMPTS = {
  inbox: 'process-inbox.v2',
  client_update: 'client-update.v1',
  follow_up: 'follow-up.v1',
  brief: 'weekly-brief.v1',
} as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const suiteArg = arg('suite');
const threshold = Number(arg('threshold') ?? 0.9);
const concurrency = Number(arg('concurrency') ?? 4);
const only = arg('only');

function load<S extends z.ZodType>(file: string, schema: S): z.infer<S>[] {
  return (
    z.array(schema).parse(JSON.parse(readFileSync(join(here, file), 'utf8'))) as z.infer<S>[]
  ).filter((c) => !only || (c as { id: string }).id.includes(only));
}
const prompt = (name: string) =>
  readFileSync(join(here, '../supabase/functions/_shared/prompts', `${name}.md`), 'utf8');

const InboxCase = z.object({
  id: z.string(),
  description: z.string(),
  kind: z.enum(['text', 'voice', 'email']),
  fixture: z.enum(['studio', 'empty']),
  input: z.string().min(1),
  clarification: z.object({ question: z.string(), answer: z.string() }).optional(),
  expect: Expectation,
});
const DraftCase = z.object({
  id: z.string(),
  description: z.string(),
  kind: z.enum(['client_update', 'follow_up']),
  context: z.custom<DraftContext>((v) => typeof v === 'object' && v != null && 'client' in v),
  expect: DraftExpectation,
});
const BriefCase = z.object({
  id: z.string(),
  description: z.string(),
  today: z.string(),
  clients: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      last_contacted_at: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      due_date: z.string().nullable(),
      priority: z.string(),
      client_id: z.string().nullable(),
      created_at: z.string().optional(),
      updated_at: z.string().optional(),
      completed_at: z.string().nullable().optional(),
    }),
  ),
  expect: BriefExpectation,
});
type BriefCase = z.infer<typeof BriefCase>;

const suites = {
  inbox: load('cases.json', InboxCase),
  drafts: load('cases-drafts.json', DraftCase),
  brief: load('cases-brief.json', BriefCase),
};
type Suite = keyof typeof suites;
const selected = (suiteArg ? [suiteArg] : Object.keys(suites)) as Suite[];
for (const s of selected) if (!(s in suites)) throw new Error(`Unknown suite ${s}`);
const allIds = Object.values(suites)
  .flat()
  .map((c) => c.id);
if (new Set(allIds).size !== allIds.length) throw new Error('Duplicate case ids across suites');

function briefData(c: BriefCase) {
  return buildBriefData({
    today: c.today,
    clients: c.clients,
    tasks: c.tasks.map((t) => ({
      ...t,
      parent_task_id: null,
      created_at: t.created_at ?? `${c.today}T00:00:00Z`,
      updated_at: t.updated_at ?? `${c.today}T00:00:00Z`,
      completed_at: t.completed_at ?? null,
    })),
  });
}

if (flag('dry')) {
  for (const c of suites.inbox) {
    const msg = renderInboxMessage(
      FIXTURES[c.fixture],
      { kind: c.kind, text: c.input },
      c.clarification,
    );
    if (!msg.includes('<untrusted_input')) throw new Error(`Case ${c.id}: input not delimited`);
  }
  for (const c of suites.drafts) renderDraftMessage(c.kind, c.context);
  for (const c of suites.brief) renderBriefMessage(briefData(c));
  for (const p of Object.values(PROMPTS)) prompt(p);
  console.log(
    `Dry run OK: ${suites.inbox.length} inbox + ${suites.drafts.length} drafts + ${suites.brief.length} brief cases valid; prompts ${Object.values(PROMPTS).join(', ')} load and render.`,
  );
  process.exit(0);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set. Run `pnpm eval --dry` for offline checks.');
  process.exit(2);
}
const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
const call: ModelCall = createClaudeCall({ apiKey, model, timeoutMs: 90_000, maxRetries: 2 });

interface Result {
  suite: Suite;
  id: string;
  passed: boolean;
  failures: string[];
  attempts: number;
  fallback: boolean;
  issues: string[];
  tokens_in: number;
  tokens_out: number;
  ms: number;
  output: unknown;
}

type Job = () => Promise<Result>;
const jobs: Job[] = [];

function result(
  suite: Suite,
  id: string,
  failures: string[],
  r: { attempts: number; issues: string[]; usage: { input_tokens: number; output_tokens: number } },
  fallback: boolean,
  started: number,
  output: unknown,
): Result {
  if (fallback) failures.unshift('fell back (model output unusable)');
  return {
    suite,
    id,
    passed: failures.length === 0,
    failures,
    attempts: r.attempts,
    fallback,
    issues: r.issues,
    tokens_in: r.usage.input_tokens,
    tokens_out: r.usage.output_tokens,
    ms: Date.now() - started,
    output,
  };
}

if (selected.includes('inbox')) {
  const system = prompt(PROMPTS.inbox);
  for (const c of suites.inbox) {
    jobs.push(async () => {
      const context = FIXTURES[c.fixture];
      const t0 = Date.now();
      const r = await runProposal({
        call,
        system,
        user: renderInboxMessage(context, { kind: c.kind, text: c.input }, c.clarification),
        effort: 'medium',
        sanitize: { context, rawInput: c.input, newClients: 'if_mentioned' },
        fallback: () => fallbackProposal(c.input),
      });
      return result(
        'inbox',
        c.id,
        check(r.proposal, c.expect, context),
        r,
        r.proposal.fallback,
        t0,
        r.proposal,
      );
    });
  }
}

if (selected.includes('drafts')) {
  for (const c of suites.drafts) {
    jobs.push(async () => {
      const t0 = Date.now();
      const r = await runStructured({
        call,
        schema: DraftMessage,
        system: prompt(PROMPTS[c.kind]),
        user: renderDraftMessage(c.kind, c.context),
        effort: 'low',
        maxTokens: 2000,
        postProcess: (d, issues) => sanitizeDraft(d, c.context, issues),
        fallback: () => fallbackDraft(c.kind, c.context),
      });
      return result('drafts', c.id, checkDraft(r.value, c.expect), r, r.fallback, t0, r.value);
    });
  }
}

if (selected.includes('brief')) {
  const system = prompt(PROMPTS.brief);
  for (const c of suites.brief) {
    jobs.push(async () => {
      const data = briefData(c);
      const t0 = Date.now();
      const r = await runStructured({
        call,
        schema: WeeklyBrief,
        system,
        user: renderBriefMessage(data),
        effort: 'low',
        maxTokens: 2000,
        postProcess: (b, issues) => sanitizeBrief(b, data, issues),
        fallback: () => fallbackBrief(data),
      });
      return result('brief', c.id, checkBrief(r.value, c.expect), r, r.fallback, t0, r.value);
    });
  }
}

async function pool(items: Job[], size: number): Promise<Result[]> {
  const out: Result[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await (items[i] as Job)();
      }
    }),
  );
  return out;
}

console.log(`Running ${jobs.length} cases (${selected.join(', ')}) on ${model}…\n`);
const results = await pool(jobs, concurrency);

for (const r of results) {
  console.log(
    `${r.passed ? 'PASS' : 'FAIL'}  [${r.suite}] ${r.id}  (${(r.ms / 1000).toFixed(1)}s, ${r.attempts} attempt${r.attempts > 1 ? 's' : ''})`,
  );
  for (const f of r.failures) console.log(`        - ${f}`);
}
console.log('');
for (const s of selected) {
  const rs = results.filter((r) => r.suite === s);
  console.log(`${s.padEnd(7)} ${rs.filter((r) => r.passed).length}/${rs.length}`);
}
const passed = results.filter((r) => r.passed).length;
const rate = passed / results.length;
console.log(
  `\nPass rate: ${passed}/${results.length} (${(rate * 100).toFixed(0)}%), threshold ${(threshold * 100).toFixed(0)}%`,
);
console.log(
  `Tokens: ${results.reduce((s, r) => s + r.tokens_in, 0)} in / ${results.reduce((s, r) => s + r.tokens_out, 0)} out`,
);

const outDir = join(here, 'results');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'latest.json'),
  JSON.stringify({ model, prompts: PROMPTS, at: new Date().toISOString(), rate, results }, null, 2),
);
console.log('Details: evals/results/latest.json');
process.exit(rate >= threshold ? 0 : 1);
