# PLAN.md — Notion 2.0 MVP

Status: **Phases 1–3 built; awaiting Phase 3 sign-off.** Open: native device checks, live eval run, hosted deploy (§10).

This file covers the architecture, the folder structure, the Phase 1 checklist, and the risks and open questions. Phases 2 to 4 are listed at a high level so Phase 1 is designed with them in mind. Each one gets a detailed checklist before it starts.

---

## 1. Final stack

| Concern           | Choice                                                                                                                                      | Notes                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo          | pnpm workspaces                                                                                                                             | `apps/mobile`, `packages/shared`, `supabase/`, `evals/`                                                                          |
| Client            | Expo (latest stable SDK at scaffold time), React Native, TypeScript strict, Expo Router                                                     | One codebase for iOS, Android, and web                                                                                           |
| Styling           | NativeWind + small custom component library                                                                                                 | Tokens in one file, light and dark from day one                                                                                  |
| Server state      | TanStack Query v5 + `persistQueryClient`                                                                                                    | Optimistic mutations; paused mutations persisted and resumed on reconnect                                                        |
| Local persistence | AsyncStorage (native) / localStorage (web)                                                                                                  | **Needs approval** (see §6). MMKV is faster but needs a dev client. Start with AsyncStorage and switch only if profiling says to |
| Backend           | Supabase: Postgres, Auth, Storage, RLS, Edge Functions (Deno)                                                                               | Local dev through the Supabase CLI and Docker                                                                                    |
| Auth              | Supabase Auth: email magic link (Phase 1), then Apple and Google                                                                            | Apple and Google need developer accounts and credentials (see §7)                                                                |
| Validation        | Zod, shared between client and edge functions                                                                                               | Lives in `packages/shared`                                                                                                       |
| AI                | Anthropic API, called **only** from edge functions                                                                                          | `ANTHROPIC_MODEL` env var, default `claude-sonnet-5-5`                                                                           |
| Editor            | **TipTap (ProseMirror) everywhere.** Web uses TipTap directly. Native uses TenTap (`@10play/tentap-editor`), which runs TipTap in a WebView | See §2                                                                                                                           |
| Gestures, haptics | `react-native-gesture-handler`, `react-native-reanimated`, `expo-haptics`                                                                   | Part of the standard Expo/Expo Router setup                                                                                      |
| Errors            | Sentry (`@sentry/react-native`)                                                                                                             | DSN from env; no user content in breadcrumbs                                                                                     |
| Unit tests        | Vitest                                                                                                                                      | Shared logic, parsers, editor formatting (headless TipTap in jsdom)                                                              |
| DB tests          | pgTAP through `supabase test db`                                                                                                            | RLS policy tests                                                                                                                 |
| E2E               | Playwright against Expo web + local Supabase                                                                                                | Magic links read from the local Supabase mail catcher                                                                            |
| Tooling           | ESLint (flat config), Prettier, `tsc --noEmit`, GitHub Actions                                                                              | CI runs typecheck, lint, unit, and DB tests                                                                                      |

## 2. Editor decision (the main risk)

Principle 4 makes reliability the deciding factor. I looked at four options:

| Option                                                                           | Web                              | iOS/Android                                                                                              | Formatting test suite                                                                                   | Verdict                                                   |
| -------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **A. TipTap on web + TenTap (TipTap in a WebView) on native**                    | Excellent; the de facto standard | Good. ProseMirror has years of hardening on mobile browsers. TenTap is maintained and used in production | **One engine, one schema, one suite.** Headless TipTap tests in Vitest cover all three platforms' logic | **Recommended**                                           |
| B. Native rich-text (e.g. `react-native-enriched`, `react-native-live-markdown`) | Separate implementation needed   | Native feel, but these libraries are young; selection, IME, and paste edge cases are less proven         | Two engines means two suites and drift between them                                                     | Too risky for "formatting bugs are release blockers"      |
| C. Markdown in a plain `TextInput` with a toolbar and live preview               | Simple                           | The most robust input (it is a plain TextInput)                                                          | Easy to test                                                                                            | Weak WYSIWYG. Users see `**`, which reads as "not Notion" |
| D. Lexical                                                                       | Good                             | React Native support is immature                                                                         | —                                                                                                       | No                                                        |

**Recommendation: Option A.**

- Notes are stored as **ProseMirror JSON** (`notes.content jsonb`), plus a derived `content_text` column for AI context and search. Markdown export is generated from the JSON.
- One extension set, defined once in `packages/shared/editor`: StarterKit (bold, italic, headings, lists, history), TaskList and TaskItem, Link, and a custom **SmartPaste** extension. Web and the native bundle both import it.
- Native needs TenTap's "advanced setup" (a custom web bundle) so the SmartPaste extension and our styles run inside the WebView. It's a one-time build step.
- The editor loads lazily, only on the note screen, so the WebView never affects cold start.
- **Fallback:** if the Week 1 device spike (task 1.9a) turns up blocking keyboard or selection bugs on Android, switch the native side to Option C. Notes keep the same JSON storage, because the markdown is converted at the boundary.

## 3. Architecture

### Data and sync

- **Client-generated UUIDs** (`crypto.randomUUID`) for every created row, so an item created offline already has its final ID and its children (subtasks) can reference it right away.
- Every mutation is optimistic: update the cache, then queue the write. Paused mutations are persisted and replayed in order on reconnect.
- **Last-write-wins** on `updated_at`, which a Postgres trigger sets. No CRDTs and no merge logic in the MVP.
- Supabase types are generated into `packages/shared/src/db.types.ts` (`pnpm db:types`).

### Security

- RLS on every table. One SQL helper, `is_workspace_member(workspace_id)`, backs every policy, so it is ready for teams through `workspace_members`.
- An `auth.users` insert trigger creates the `profiles` row, a default `workspaces` row, and an owner `workspace_members` row.
- Edge functions use the caller's JWT, so RLS applies. A service-role key is used only where it is required (account deletion), and only on the server.

### AI pattern: Propose, Review, Apply, Undo (built in Phase 2, schema ready in Phase 1)

- `ai_actions.proposed_changes` holds the validated proposal. On accept, a Postgres function `apply_ai_action(action_id, selected_change_ids)` applies the changes **in one transaction** and writes `ai_actions.applied_changes` (the exact IDs it created).
- `undo_ai_action(action_id)` deletes exactly those rows in one transaction.
- The apply/undo logic is pure and lives in `packages/shared` (the diff from proposal to operations). It is unit-tested, and the SQL function executes it.

### Shared code across Node and Deno

- `packages/shared` is plain TypeScript with no Node or Deno APIs. Its only runtime dependency is `zod`.
- Edge functions import it through `supabase/functions/deno.json` (an import map: `"@shared/": "../../packages/shared/src/"`, `"zod": "npm:zod@..."`).
- **Risk:** deploy-time bundling of paths outside `supabase/functions`. Phase 1 verifies this with a no-op function. The fallback is a `pnpm sync:shared` copy step.

## 4. Folder structure

```
.
├─ apps/
│  └─ mobile/                      # Expo app (iOS, Android, web)
│     ├─ src/app/                  # Expo Router routes (SDK 57 convention: under src/)
│     │  ├─ _layout.tsx            # providers: theme, query, auth, Sentry
│     │  ├─ (auth)/                # welcome, sign-in, magic-link callback
│     │  ├─ (onboarding)/          # Phase 2: 3 questions + generation
│     │  ├─ (tabs)/                # bottom tabs
│     │  │  ├─ _layout.tsx         # tabs + floating capture button
│     │  │  ├─ index.tsx           # Today
│     │  │  ├─ inbox.tsx
│     │  │  ├─ clients/index.tsx
│     │  │  └─ brief.tsx           # placeholder until Phase 3
│     │  ├─ clients/[id].tsx
│     │  ├─ projects/[id].tsx
│     │  ├─ tasks/[id].tsx
│     │  ├─ notes/[id].tsx
│     │  ├─ capture.tsx            # modal sheet
│     │  └─ settings.tsx
│     ├─ src/
│     │  ├─ components/ui/         # Button, Text, Sheet, Skeleton, ListRow, Checkbox, SwipeRow, EmptyState...
│     │  ├─ features/              # one folder per domain: hooks + components
│     │  │  ├─ auth/ clients/ projects/ tasks/ notes/ today/ capture/
│     │  ├─ editor/                # RichEditor.web.tsx, RichEditor.native.tsx, toolbar
│     │  ├─ lib/                   # supabase client, queryClient + persistence, ids, haptics, sentry
│     │  └─ theme/                 # tokens (colors, spacing, type), useTheme
│     ├─ editor-web-bundle/        # TenTap custom bundle source (native WebView)
│     └─ e2e/                      # Playwright specs
├─ packages/
│  └─ shared/
│     └─ src/
│        ├─ schemas/               # Zod: entities, AI proposals, edge function I/O
│        ├─ paste/                 # smart paste parser (no AI)
│        ├─ dates/                 # timezone-aware date helpers
│        ├─ ai/                    # apply/undo pure logic
│        ├─ editor/                # TipTap extension set + SmartPaste extension
│        └─ db.types.ts            # generated
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                  # timestamped SQL
│  ├─ seed.sql
│  ├─ tests/                       # pgTAP RLS tests
│  └─ functions/
│     ├─ deno.json
│     ├─ _shared/                  # anthropic client, auth helper, rate limit
│     │  └─ prompts/               # versioned prompts, e.g. process-inbox.v1.md (Phase 2)
│     ├─ process-inbox/            # Phase 2
│     └─ generate-workspace/       # Phase 2
├─ evals/                          # Phase 2: cases/*.json + runner (`pnpm eval`)
├─ .github/workflows/ci.yml
├─ .env.example
├─ CLAUDE.md  PLAN.md  DECISIONS.md  PRIVACY.md
└─ package.json  pnpm-workspace.yaml  tsconfig.base.json  eslint.config.js  .prettierrc
```

## 5. Phase 1 schema (final shape for approval)

These are the tables from the brief. **Additions are marked ➕**. I want to lock these in now, because changing the data model after Phase 1 needs approval.

- `profiles` (id → auth.users, display_name, business_type, ➕`timezone` text default 'UTC', ➕`tone` text null, ➕`onboarded_at` timestamptz null, created_at, ➕updated_at)
- `workspaces` (id, name, owner_id, created_at, ➕updated_at), `workspace_members` (workspace_id, user_id, role [owner/member], created_at)
- `clients` (id, workspace_id, name, email, notes, status [active/paused/archived], color, ➕`last_contacted_at` (for "hasn't heard from you"), created_at, updated_at)
- `projects` (id, workspace_id, client_id, title, status ➕[active/on_hold/done/archived], due_date, summary, created_at, updated_at)
- `tasks` (id, workspace_id, project_id?, client_id?, ➕`parent_task_id`?, title, notes, status [todo/doing/done], due_date?, priority [none/low/med/high], position (float, so reordering only rewrites one row), source [manual/ai], ➕`ai_action_id`?, created_at, completed_at, updated_at)
- `notes` (id, workspace_id, client_id?, project_id?, title, content jsonb, ➕`content_text`, ➕`ai_action_id`?, created_at, updated_at)
- `inbox_items` (id, workspace_id, kind [text/voice/email/image], raw_content, ➕`storage_path`? (for images/audio), status [pending/processed/dismissed], created_at, updated_at)
- `ai_actions` (id, workspace_id, inbox_item_id?, type, proposed_changes jsonb, ➕`applied_changes` jsonb (needed for exact undo), status [proposed/accepted/rejected/edited/undone], model, ➕`prompt_version`, tokens_in, tokens_out, created_at, updated_at)
- `time_entries` (id, ➕`workspace_id` (needed for RLS), task_id?, project_id?, started_at, ended_at, minutes, billable, created_at, updated_at)
- ➕`events` (id, workspace_id, user_id, name, props jsonb, created_at). A first-party analytics table for the §13 success metrics with no third-party dependency. Props never contain user content.
- `invoices` / `invoice_items`: **not created in Phase 1** (see open question Q4).

Indexes: `(workspace_id, status, due_date)` on tasks for Today, `(parent_task_id, position)` for checklists, and `(workspace_id, status, created_at)` on inbox_items.

## 6. Dependencies needing approval (not named in the brief)

1. `@10play/tentap-editor` (native editor), plus `@tiptap/*` packages (web and shared)
2. `@react-native-async-storage/async-storage`, plus `@tanstack/query-async-storage-persister` and `@tanstack/react-query-persist-client`
3. `@react-native-community/netinfo` (online/offline detection for TanStack `onlineManager`)
4. `date-fns` + `date-fns-tz` (timezone-safe due dates and "today" boundaries)
5. `jsdom` (dev; headless editor tests)

Expo-ecosystem packages that Expo Router and the brief already imply (`expo-haptics`, `expo-linking`, `expo-secure-store`, gesture-handler, reanimated) are treated as approved.

## 7. Risks and ambiguities

**Risks**

1. **Native editor reliability (high).** Android IME and selection inside a WebView. _Mitigation:_ a device spike before building features on it, and the Option C fallback described above.
2. **Smart paste on native.** Intercepting paste inside the TenTap WebView requires the custom bundle and a bridge message. _Mitigation:_ this is built and tested first in the editor slice.
3. **Offline + LWW.** Two devices editing the same task offline: the last write wins silently. Acceptable for a single user in the MVP, and documented.
4. **Sharing code between Deno and Node.** Covered in §3, with a fallback.
5. **Cold start under 2s.** The editor loads lazily, Today renders from the persisted cache before the network returns, and Sentry is initialized without blocking.
6. **Expo/NativeWind version compatibility.** Pin versions known to work together at scaffold time.

**Ambiguities / open questions (please answer)**

- **Q1. Editor.** Approve Option A (TipTap + TenTap) with the Option C fallback?
- **Q2. Dependencies.** Approve the list in §6?
- **Q3. Schema additions.** Approve the ➕ fields in §5 (especially `applied_changes`, `time_entries.workspace_id`, `profiles.timezone/tone`, and the `events` table)?
- **Q4. Phase conflict.** The brief puts `invoices` and inbound email in Phase 3 (§5, §11) _and_ lists invoicing and email forwarding under Phase 4 (§6). My proposal: inbound email in **Phase 3**, invoicing in **Phase 4**, with the invoice tables created in Phase 4's migration. OK?
- **Q5. Checklists in notes vs tasks.** "Turn into checklist" inside a **task** creates subtasks (rows). Inside a **note** it creates an editor checklist that is _not_ a set of tasks, so those items won't appear in Today. Is that right for the MVP, or should note checklists be promotable to tasks?
- **Q6. Undo semantics.** If a user edits an AI-created task and then hits Undo on that proposal, my default is to still remove it, after a confirm that says "1 item was edited since". OK?
- **Q7. Accounts and credentials.** Phase 1 runs entirely against **local** Supabase. Do you have, or want me to plan for, a hosted Supabase project, an Apple Developer account (Sign in with Apple), Google OAuth client IDs, and a Sentry DSN? Apple and Google sign-in stay wired but disabled until the credentials exist.

## 8. Phase 1 checklist: Foundation

Each slice works end to end (UI, API/DB, tests) before the next one starts.

**1.1 Repo and tooling**

- [x] pnpm workspace, `tsconfig.base.json` (strict), ESLint flat config, Prettier, `.editorconfig`
- [x] Expo app scaffold (Expo SDK 57, TypeScript, Expo Router, web enabled), NativeWind configured
- [x] `packages/shared` with Vitest (plus `packages/editor`, see DECISIONS)
- [x] `.env.example` (Supabase URL/anon key, Sentry DSN; server only: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`)
- [x] GitHub Actions: install, typecheck, lint, unit tests, `supabase start` + `supabase test db` + Playwright
- [x] `DECISIONS.md`, `PRIVACY.md` (initial)

**1.2 Database**

- [x] Migrations for every §5 table, enums, `updated_at` triggers, indexes
- [x] `is_workspace_member()` and RLS policies on every table
- [x] Signup trigger: profile + workspace + membership (+ `signup_completed` event)
- [x] `seed.sql`: two demo users, each with a workspace, clients, projects, tasks, and subtasks
- [x] pgTAP tests: user A cannot select, insert, update, or delete user B's rows in every table; anon has no access; the signup trigger works (54 assertions)
- [x] Generated types into `packages/shared`; `health` edge function imports `@shared` via import map (resolution verified locally; deploy-time bundling still unverified, needs a hosted project)

**1.3 Design system**

- [x] Tokens (one accent color, neutrals, semantic colors, spacing, radii, type scale), light and dark
- [x] Components: Text, Button, IconButton, TextField, ListRow, Checkbox, SwipeRow, Skeleton, EmptyState, Toast (with Undo). Sheets use Expo Router modal presentation instead of a custom component
- [x] Dynamic type and accessibility labels on every interactive component

**1.4 Auth + shell**

- [x] Welcome and magic-link sign-in (PKCE), deep-link callback; session in AsyncStorage (SecureStore's 2KB limit is too small, see DECISIONS)
- [x] Route guards: unauthenticated users go to (auth)
- [x] Bottom tabs (Today, Inbox, Clients, Brief) and the floating capture button. In Phase 1, capture saves a `text` inbox item with no AI
- [x] Settings stub: sign out, timezone, delete account

**1.5 Data layer**

- [x] Supabase client, TanStack Query with a persisted cache, NetInfo-driven `onlineManager`, persisted paused mutations
- [x] Optimistic write helper (`useDbWrite` + `updateList`): cache update, serial write queue, refetch-to-rollback on rejection, error toast
- [x] Unit tests: rollback and offline queue replay order (incl. replay after app restart)

**1.6 Slice: Clients** ✅: list, create (name only is required), detail page (projects, tasks, notes), edit name, status/archive, delete, "contacted today". _Cut: editing email after creation._

**1.7 Slice: Projects** ✅: create under a client, detail page with its task list, edit, status, delete. _Cut: project due date editing._

**1.8 Slice: Tasks**

- [x] Create (quick add), detail (title, notes, due date, priority, status), delete with an Undo toast
- [x] Subtasks/checklist: add, complete, remove; bulk insert in one request. _Cut: drag-to-reorder UI (position math is built and tested)_
- [x] Optimistic complete with haptics; swipe to complete and swipe to snooze (with Undo)
- [x] Unit tests: position math; `completed_at` consistency enforced by a DB trigger and covered in pgTAP

**1.9 Slice: Today** ✅: overdue + due today grouped by client, "Needs follow-up" (clients past N days since `last_contacted_at`; N defaults to 7), swipe to complete, skeletons, empty state. Unit tests for timezone-correct day boundaries.

**1.10 Slice: Editor**

- [ ] (a) **Device spike**: TenTap on an iOS and an Android device; go or fallback decision recorded in `DECISIONS.md`. **Not done: needs a physical device or simulator (not available in the cloud container).**
- [x] Shared extension set; web and native editors; toolbar (B, I, H1/H2, bullets, checklist, link, undo/redo; indent/outdent on native)
- [x] Autosave (debounced 600ms, flushed on leave), with `content_text` derived on save (Markdown)
- [x] **Formatting suite (Vitest, headless TipTap, 42 cases):** bold/italic on a selected paragraph, toggle off, mixed marks, headings, nested bullet and ordered lists (indent/outdent), task list toggle, links (add/edit/remove), undo/redo across each operation, paste fixtures (Gmail HTML, Google Docs HTML, Notion HTML, plain text, web page), round trip JSON → markdown

**1.11 Slice: Smart Paste to Checklist (no AI)**

- [x] Parser in `packages/shared/paste`: splits lines; strips bullets (`-`, `*`, `•`, `–`, `[ ]`, `[x]`, `1.`, `1)`, `a.`); keeps checked state; trims; drops empties; collapses wrapped lines; caps at 200 items
- [x] 30+ unit test cases, including the edge cases that should _not_ trigger (a single line, prose paragraphs)
- [x] UI: pasting 2+ lines into a task's title or notes, or into the editor, shows the "Turn into checklist (N items)" chip. One tap creates the subtasks or the editor task list. Works offline. Also in quick add (creates N tasks) and the capture sheet

**1.12 E2E + wrap-up**

- [x] Playwright (web): sign up via magic link, create a client and a task, complete a task, paste to checklist (5 specs)
- [x] Sentry wired (no PII, native only for now); `events` written for `signup_completed`, `task_completed`, `checklist_from_paste` and more
- [x] Typecheck, lint, and tests green; phase summary written

## 9. Phase 2 checklist: AI core

Decisions taken at kickoff (2026-10-04): voice = keyboard dictation (no new dependency); OS share sheet deferred to Phase 3; Claude is called through the official `@anthropic-ai/sdk` (server only); live evals are run by the owner with their own key.

**2.1 Shared AI core (`packages/shared/src/ai`, pure + tested)**

- [x] Zod schemas: proposal (`summary`, `proposed_changes[]`, `questions[]`, `confidence`), change ops `create_client` / `create_project` / `create_task` (+ subtasks) / `create_note` / `draft_reply`, with in-proposal `ref`s so a task can point at a project proposed in the same response
- [x] Prompt rendering: workspace context + untrusted input in delimited tags (closing tags escaped)
- [x] Guardrails: unknown ids become `null`, invalid or absurd dates become `null`, new clients only if the name appears in the input, caps on counts and lengths
- [x] Core runners with an injected model call: retry once on invalid output, then fall back to "one task from this text"
- [x] Apply planner: proposal + user selection/edits → rows; deterministic starter templates per business type (the onboarding fallback)
- [x] Mock model (`AI_MOCK=1`, server-side only) for local dev and e2e without an API key

**2.2 Database**

- [x] `apply_ai_action(action, rows)`: one transaction, checks membership and status, records exact `applied_changes`, marks `accepted` or `edited`, marks the inbox item processed
- [x] `undo_ai_action(action, force)`: deletes exactly the applied rows; reports rows edited since apply unless `force`
- [x] `reject_ai_action(action)`
- [x] pgTAP tests for all three (including cross-workspace attempts)

**2.3 Edge functions**

- [x] `_shared`: Claude adapter (SDK, model from `ANTHROPIC_MODEL`, structured outputs, refusal handling, server-side fallback), auth'd Supabase client, rate limit (per workspace per hour), input cap, token logging
- [x] Versioned prompts: `process-inbox.v1.md`, `generate-workspace.v1.md`
- [x] `process-inbox` (text, voice transcript; clarifying-question round trip)
- [x] `generate-workspace` (under 10s target; template fallback on timeout/error)

**2.4 App**

- [x] Onboarding: 3 questions → generation skeleton → reviewable starter workspace → Today
- [x] Inbox: process a dump, proposal cards, clarifying question answer, retry
- [x] Review sheet: per-change checkboxes, inline edit, Accept selected / Reject; Undo (toast + from the inbox history)
- [x] Capture: Type / Speak (dictation) modes; "Dump it" processes immediately
- [x] Events: `onboarding_completed`, `ai_proposal_accepted` / `rejected` / `undone` (counts and timings only)

**2.5 Quality**

- [x] `evals/` with 26 realistic cases and assertions (client matched, dates resolved, no invented entities, injection resisted); `pnpm eval` (live) and `pnpm eval --dry` (offline checks). **Live pass rate not yet measured: needs an API key (owner runs it).**
- [x] Playwright: onboarding, dump → proposal → accept → undo (mock model)

## 10. Phase 3 checklist: Retention

Decisions at kickoff (2026-10-04): inbound email via **Postmark Inbound**; **push notifications** built now (`expo-notifications`); **`expo-image-picker`** approved (screenshot → vision); OS share sheet (`expo-share-intent`) not approved, so it moves to Phase 4. Schema additions approved: `workspaces.inbound_token`, `push_tokens`, `profiles.notification_prefs`, private Storage bucket `inbox`.

**3.1 Time tracking** (reuses `time_entries`)

- [x] Shared logic: one running timer at a time, minutes from start/stop, totals by task/project/client, formatting
- [x] Task detail: start/stop timer, add manual entry (minutes, date, billable), entry list with delete + Undo
- [x] Running-timer bar visible across the app; totals on client and project pages

**3.2 Client Update Writer + follow-up drafts** (AI, `draft-message` function)

- [x] Context builder: completed + open tasks, recent notes, time logged since the last update; user's saved tone (Settings)
- [x] Prompts `client-update.v1.md`, `follow-up.v1.md` (live eval pass rate pending: owner runs `pnpm eval`); schema `{ subject, body }`; never invents dates, prices or work
- [x] UI: "Write update" on client/project pages, "Draft follow-up" on Needs follow-up rows; editable draft → Share sheet → "Mark as sent" (sets `last_contacted_at`)

**3.3 Weekly Brief** (AI, `weekly-brief` function)

- [x] Deterministic brief data: overdue, stale (doing/open too long), silent clients, candidate priorities
- [x] AI picks and explains the top 5 (ids only from candidates) with one-tap actions; deterministic fallback
- [x] Brief tab: auto-generates on the first open each week (Monday start) and on demand

**3.4 Screenshot capture** (vision)

- [x] Private `inbox` bucket with per-workspace RLS; upload from capture ("Photo" mode)
- [x] `process-inbox` sends the image to Claude (image block); size/type caps; prompt bumped to `process-inbox.v2`

**3.5 Inbound email** (Postmark)

- [x] Per-workspace forwarding address (`<token>@<INBOUND_EMAIL_DOMAIN>`), shown in Settings with regenerate
- [x] `inbound-email` webhook (basic-auth secret) → inbox item (kind email) → organized automatically; flood cap

**3.6 Push notifications**

- [x] `push_tokens` + notification prefs in Settings (digest on/off + hour, follow-up nudges on/off)
- [x] `send-notifications` function (service role) run hourly by pg_cron: daily Today digest at the user's local hour, stale-client nudges, Monday "brief ready"
- [x] Planner logic unit-tested; Expo push endpoint overridable for tests. **Real-device delivery not verified (needs an EAS project id + device).**

**3.7 Quality**

- [x] pgTAP for new tables/policies/storage; eval suites for brief, client update and follow-up prompts; Playwright for time tracking, client update, brief, inbound email

## 11. Later phases (outline only)

- **Phase 4, launch:** RevenueCat/Stripe paywall and free-tier limits, invoicing, OS share sheet, analytics polish, store assets, landing page, export/deletion audit, crash-free audit.
