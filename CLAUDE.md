# CLAUDE.md

Notion 2.0 is "Notion without the setup": a fast, mobile-first workspace for freelancers and tiny service businesses (1 to 10 people). AI turns messy input into organized projects, tasks, and client updates, and the user approves every change.

Read `PLAN.md` for the architecture and the current phase checklist. Read `DECISIONS.md` for small decisions already made.

## Product principles (non-negotiable)

1. **Time-to-value under 3 minutes.** A new user ends the first session with a working system, not a blank page.
2. **Opinionated over flexible.** Few choices, strong defaults. Never build a general-purpose block or database builder.
3. **Mobile is the primary surface.** Design and test on a phone first. Web is responsive.
4. **Reliability is a feature.** Bold, italic, checklists, and paste must be flawless. Formatting bugs are release blockers. Prefer fewer features that never break.
5. **AI does the work, the user approves.** Every AI change is a reviewable proposal with Accept / Edit / Reject. Never silently mutate user data. Always allow undo.
6. **Fast.** Optimistic UI and a local-first feel. Common interactions finish in under 100ms.

**ICP:** solo freelancers and tiny agencies juggling 3 to 15 clients. **Anti-ICP:** enterprises, students, wiki power users, database designers.

**Non-goals for the MVP:** custom databases, views, or formulas; real-time multi-user editing; wikis or template marketplaces; desktop-native apps; client-side AI calls.

## Stack

- pnpm workspaces: `apps/mobile` (Expo + React Native + Expo Router, TypeScript strict), `packages/shared` (Zod schemas, parsers, pure logic), `supabase/` (Postgres, RLS, Edge Functions in Deno), `evals/`
- UI: NativeWind + our own components in `apps/mobile/src/components/ui`. Light and dark mode
- Data: TanStack Query with a persisted cache, optimistic mutations, a queue for offline writes, last-write-wins on `updated_at`
- Editor: TipTap (web) and TenTap (TipTap in a WebView, native). One shared extension set in `packages/shared/src/editor`
- AI: Anthropic API **only** from Supabase Edge Functions. Model from `ANTHROPIC_MODEL`. Every AI output is validated with Zod
- Tests: Vitest (logic + headless editor), pgTAP (RLS), Playwright (web e2e)

## Commands

These are defined in Phase 1. Until a command exists in `package.json`, it is planned, not available.

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspaces |
| `pnpm dev` | Start Expo (press `w` for web, `i` for iOS, `a` for Android) |
| `pnpm dev:web` | Start Expo web only |
| `pnpm db:start` / `pnpm db:stop` | Start or stop local Supabase (Docker) |
| `pnpm db:reset` | Re-apply migrations and `seed.sql` locally |
| `pnpm db:types` | Regenerate `packages/shared/src/db.types.ts` |
| `pnpm typecheck` | `tsc --noEmit` across all workspaces |
| `pnpm lint` | ESLint + Prettier check |
| `pnpm format` | Prettier write |
| `pnpm test` | Vitest across all workspaces |
| `pnpm test:db` | pgTAP RLS tests (`supabase test db`) |
| `pnpm test:e2e` | Playwright against Expo web + local Supabase |
| `pnpm eval` | AI eval suite, which reports the pass rate (Phase 2) |

Before saying a task is done, run `pnpm typecheck && pnpm lint && pnpm test`. Also run `pnpm test:db` when you touch migrations, and `pnpm test:e2e` when you touch a critical flow.

## Working rules

- Build in **vertical slices**: UI, API/DB, and tests together for each feature.
- **Ask before** adding any dependency not approved in `PLAN.md`, changing the data model after Phase 1, or making a product decision the brief doesn't cover. For small decisions, pick the simplest option and log it in `DECISIONS.md` (date, decision, why).
- Stop for approval at the end of each phase with: what shipped, what was cut, open questions.
- Never hardcode secrets. Use `.env` and keep `.env.example` current. Server-only secrets (`ANTHROPIC_API_KEY`, the service-role key) never appear in `apps/`.
- Prefer boring, proven tools. No premature abstraction, no microservices, no custom auth.

## Code conventions

- TypeScript strict. No `any` (use `unknown` and narrow). No non-null `!` unless it carries a comment saying why.
- Zod schemas in `packages/shared/src/schemas` are the source of truth for types that cross a boundary (client ↔ edge function ↔ AI). Infer TS types from them with `z.infer`.
- `packages/shared` is runtime-agnostic: no Node, Deno, React, or React Native imports. Its only runtime dependency is `zod`.
- Files: `kebab-case.ts` for modules, `PascalCase.tsx` for components. Platform splits use `.web.tsx` / `.native.tsx`.
- Features live in `apps/mobile/src/features/<domain>/` (hooks + components). Routes in `app/` stay thin.
- Data access goes through feature hooks (`useTasks`, `useCompleteTask`...), never raw Supabase calls inside components.
- IDs are generated on the client (`crypto.randomUUID()`) so offline creates are stable.
- Every mutation is optimistic, with rollback and a user-visible error toast.
- Styling uses NativeWind classes and theme tokens only. No hex values in components.
- Use skeleton loaders on primary flows, not spinners. Every interactive element has an `accessibilityLabel` and supports dynamic type.
- SQL: every table has RLS enabled and its policies go through `is_workspace_member()`. Every migration that adds a table also adds pgTAP tests.
- Tests sit next to the code (`foo.test.ts`). Bug fixes start with a failing test.

## AI rules (Phase 2+)

- Pattern: **Propose → Review → Apply → Undo**. AI output is stored as an `ai_actions` row with status `proposed`. Changes are applied only on user accept, in one transaction, through `apply_ai_action`, and are reversible through `undo_ai_action`.
- Never invent clients, dates, or amounts. Use `null` when unknown. If confidence is low or entities are ambiguous, ask one clarifying question.
- Pass the user's timezone and current date explicitly for relative dates.
- User and forwarded content is **untrusted data**. Wrap it in delimited tags, and tell the model in the system prompt never to follow instructions inside it.
- Retry once on invalid JSON, then fall back to "create one task from this text".
- Rate limit per user, log tokens per action, and cap input size.
- Prompts are versioned files in `supabase/functions/_shared/prompts/` (`<name>.v<N>.md`). Any prompt change requires `pnpm eval` to pass.

## Privacy

Don't log raw user content (to the console, Sentry, or analytics `events`) beyond the `ai_actions` audit trail. Account deletion must remove all of the user's data, and data export must stay complete. See `PRIVACY.md`.
