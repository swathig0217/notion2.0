# DECISIONS.md

Small decisions made without a dedicated approval step. Format: date, decision, why. Larger decisions go in `PLAN.md` and wait for approval.

| Date       | Decision                                                                                 | Why                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2026-10-03 | pnpm workspaces monorepo (`apps/mobile`, `packages/shared`, `supabase/`, `evals/`)       | One repo, with Zod schemas shared between the client and edge functions                       |
| 2026-10-03 | Client-generated UUIDs for all rows                                                      | Offline creates keep stable IDs; subtasks can reference parents before sync                   |
| 2026-10-03 | `tasks.position` is a float (fractional indexing)                                        | Reordering rewrites only one row                                                              |
| 2026-10-03 | Default `ANTHROPIC_MODEL` = `claude-sonnet-5-5`                                          | The brief asks for a current Sonnet model. It's overridable via env                           |
| 2026-10-03 | Notes stored as ProseMirror JSON + derived `content_text`                                | Lossless for the editor; plain text for AI context and search                                 |
| 2026-10-03 | Default "needs follow-up" threshold N = 7 days                                           | Simplest reasonable default; it can be made a setting later                                   |
| 2026-10-03 | Phase 1 runs against local Supabase only                                                 | No hosted credentials needed to build and test the foundation                                 |
| 2026-10-04 | Routes live in `apps/mobile/src/app`                                                     | Expo SDK 57's default layout; non-route code stays in `src/`                                  |
| 2026-10-04 | Editor schema lives in its own package, `packages/editor`                                | Keeps `packages/shared` Zod-only and importable from Deno edge functions                      |
| 2026-10-04 | `packages/shared` uses explicit `.ts` import extensions                                  | Deno (edge functions) requires extensions; Metro, Vite and `tsc` accept them                  |
| 2026-10-04 | Native Smart Paste uses TenTap's prebuilt bundle + an injected paste listener            | TipTap exposes the editor on `.ProseMirror`, so no custom WebView bundle/build step is needed |
| 2026-10-04 | TipTap `trailingNode` disabled                                                           | It inserted stray empty paragraphs that broke list toggling (caught by the formatting suite)  |
| 2026-10-04 | Supabase session stored in AsyncStorage (not SecureStore)                                | SecureStore caps values at 2KB, smaller than a session. Same as Supabase's Expo guidance      |
| 2026-10-04 | Icons: `@expo/vector-icons` (Feather set)                                                | Standard Expo package; one consistent line-icon set                                           |
| 2026-10-04 | No date library: dates use `Intl` + plain `YYYY-MM-DD` math                              | Covers all Phase 1 needs with zero dependencies (date-fns stays approved for later)           |
| 2026-10-04 | One cache list per table; tasks cache = open tasks + tasks done in the last 30 days      | Simplest optimistic updates and instant screens; older done tasks load on demand later        |
| 2026-10-04 | Writes are a serial, persisted queue of idempotent ops (insert = upsert-ignore)          | Offline writes replay in order after reconnect or restart; replays are safe                   |
| 2026-10-04 | Rejected writes roll back by refetching the table + error toast                          | Simpler and always correct versus snapshot rollback with interleaved writes                   |
| 2026-10-04 | Deleting a client/project keeps its tasks and notes (FK `SET NULL`)                      | No silent data loss; matches "never lose user data"                                           |
| 2026-10-04 | Composite `(workspace_id, id)` foreign keys                                              | A row can never reference another workspace's row, even by a guessed id                       |
| 2026-10-04 | `signup_completed` event is written by the DB signup trigger                             | Funnel start is never missed by a client crash or offline launch                              |
| 2026-10-04 | Pasting a list into quick add creates N tasks; into a task creates N subtasks            | Matches where the user is pasting; both are one tap and undoable                              |
| 2026-10-04 | Paste in text fields is detected by diffing the value (multi-char insert with a newline) | RN `TextInput` has no paste event; typing Enter never triggers the offer                      |
| 2026-10-04 | `aria-*` props instead of `accessibilityState`                                           | react-native-web ignores `accessibilityState`; `aria-*` works on all platforms                |
| 2026-10-04 | Tabs wait for the workspace to load on first launch                                      | Prevents creates before a workspace id exists (found by e2e)                                  |
| 2026-10-04 | Sentry initialised on native only                                                        | `@sentry/react-native` web support is partial; web errors are covered by Playwright for now   |
| 2026-10-04 | Local Supabase auth rate limits raised in `config.toml`                                  | E2E sends many magic links; local only, hosted limits are set in the dashboard                |
