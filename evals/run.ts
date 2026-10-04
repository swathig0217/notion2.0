/**
 * AI eval runner for the inbox processor.
 *
 *   pnpm eval            live: calls Claude (needs ANTHROPIC_API_KEY), prints the pass rate
 *   pnpm eval --dry      offline: validates cases and renders every prompt, no API calls
 *   pnpm eval --only acme --prompt process-inbox.v1 --threshold 0.9 --concurrency 4
 *
 * Live runs use the exact production path: the same prompt file, message rendering,
 * Claude adapter, retry/fallback and guardrails as the `process-inbox` edge function.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  fallbackProposal,
  renderInboxMessage,
  runProposal,
  type ModelCall,
} from '../packages/shared/src/ai/index.ts';
import { createClaudeCall, DEFAULT_MODEL } from '../supabase/functions/_shared/claude.ts';
import { check, Expectation } from './assertions.ts';
import { FIXTURES } from './fixtures.ts';

const here = dirname(fileURLToPath(import.meta.url));

const Case = z.object({
  id: z.string(),
  description: z.string(),
  kind: z.enum(['text', 'voice', 'email']),
  fixture: z.enum(['studio', 'empty']),
  input: z.string().min(1),
  clarification: z.object({ question: z.string(), answer: z.string() }).optional(),
  expect: Expectation,
});
type Case = z.infer<typeof Case>;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const promptName = arg('prompt') ?? 'process-inbox.v1';
const threshold = Number(arg('threshold') ?? 0.9);
const concurrency = Number(arg('concurrency') ?? 4);
const only = arg('only');

const cases = z
  .array(Case)
  .parse(JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8')))
  .filter((c) => !only || c.id.includes(only));
const ids = new Set<string>();
for (const c of cases) {
  if (ids.has(c.id)) throw new Error(`Duplicate case id: ${c.id}`);
  ids.add(c.id);
}
const system = readFileSync(
  join(here, '../supabase/functions/_shared/prompts', `${promptName}.md`),
  'utf8',
);

function render(c: Case) {
  return renderInboxMessage(FIXTURES[c.fixture], { kind: c.kind, text: c.input }, c.clarification);
}

if (flag('dry')) {
  for (const c of cases) {
    const msg = render(c);
    if (!msg.includes('<untrusted_input')) throw new Error(`Case ${c.id}: input not delimited`);
  }
  console.log(
    `Dry run OK: ${cases.length} cases valid, prompt ${promptName} (${system.length} chars) renders for all.`,
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
  id: string;
  passed: boolean;
  failures: string[];
  attempts: number;
  fallback: boolean;
  issues: string[];
  tokens_in: number;
  tokens_out: number;
  ms: number;
  proposal: unknown;
}

async function runCase(c: Case): Promise<Result> {
  const context = FIXTURES[c.fixture];
  const started = Date.now();
  const r = await runProposal({
    call,
    system,
    user: render(c),
    effort: 'medium',
    sanitize: { context, rawInput: c.input, newClients: 'if_mentioned' },
    fallback: () => fallbackProposal(c.input),
  });
  const failures = check(r.proposal, c.expect, context);
  if (r.proposal.fallback) failures.unshift('fell back (model output unusable)');
  return {
    id: c.id,
    passed: failures.length === 0,
    failures,
    attempts: r.attempts,
    fallback: r.proposal.fallback,
    issues: r.issues,
    tokens_in: r.usage.input_tokens,
    tokens_out: r.usage.output_tokens,
    ms: Date.now() - started,
    proposal: r.proposal,
  };
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

console.log(`Running ${cases.length} cases on ${model} with ${promptName}…\n`);
const results = await pool(cases, concurrency, runCase);

for (const r of results) {
  console.log(
    `${r.passed ? 'PASS' : 'FAIL'}  ${r.id}  (${(r.ms / 1000).toFixed(1)}s, ${r.attempts} attempt${r.attempts > 1 ? 's' : ''})`,
  );
  for (const f of r.failures) console.log(`        - ${f}`);
}
const passed = results.filter((r) => r.passed).length;
const rate = passed / results.length;
const tokensIn = results.reduce((s, r) => s + r.tokens_in, 0);
const tokensOut = results.reduce((s, r) => s + r.tokens_out, 0);
console.log(
  `\nPass rate: ${passed}/${results.length} (${(rate * 100).toFixed(0)}%), threshold ${(threshold * 100).toFixed(0)}%`,
);
console.log(`Tokens: ${tokensIn} in / ${tokensOut} out`);

const outDir = join(here, 'results');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'latest.json'),
  JSON.stringify(
    { model, prompt: promptName, at: new Date().toISOString(), rate, results },
    null,
    2,
  ),
);
console.log(`Details: evals/results/latest.json`);
process.exit(rate >= threshold ? 0 : 1);
