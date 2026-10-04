# PRIVACY.md

How Notion 2.0 handles user data. This is an engineering commitment that every change must keep true. It is not legal copy.

## Principles

1. **Your content is yours.** We store what you write (clients, projects, tasks, notes, inbox dumps) only to provide the product to you.
2. **No training on user content.** User content is never used to train models. AI calls (Phase 2+) go through the Anthropic API from our server only, with the model set by `ANTHROPIC_MODEL`.
3. **Minimum logging.** Raw user content is never written to logs, Sentry, or analytics. The only place AI inputs and outputs are kept is the `ai_actions` audit trail, which exists so you can review and undo AI changes.
4. **Isolation by default.** Every table has Row Level Security. A user can only read or write rows in workspaces they belong to (see `supabase/tests/rls.test.sql`).

## What we store

| Data                                                  | Where                                        | Why                                                                                                |
| ----------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Email address                                         | Supabase Auth                                | Sign-in (magic link)                                                                               |
| Profile (display name, business type, timezone, tone) | `profiles`                                   | Personalization, correct "today" and due dates                                                     |
| Clients, projects, tasks, notes, time entries         | workspace tables                             | The product                                                                                        |
| Inbox dumps                                           | `inbox_items`                                | Capture and (Phase 2) AI processing                                                                |
| AI proposals and what was applied                     | `ai_actions`                                 | Review, accept, and exact undo of AI changes; token counts for usage limits                        |
| Product events                                        | `events`                                     | Success metrics (e.g. "task completed"). **Props hold counts, ids, and enums only, never content** |
| Local cache                                           | Device storage (AsyncStorage / localStorage) | Offline use and fast startup. Cleared on sign out                                                  |

## Error reporting (Sentry)

- `sendDefaultPii: false`.
- Breadcrumbs from the console and UI text are dropped, and request bodies are stripped.
- Errors are tagged with table and operation names only (`lib/sentry.ts`).

## Deletion and export

- **Account deletion** (`Settings → Delete account`) calls `public.delete_my_account()`. It deletes the auth user, and every table cascades from it: profile, workspace, and all workspace data including `ai_actions` and `events`. This is covered by RLS tests.
- **Data export** ships in Phase 4. Notes are exportable as Markdown (`docToMarkdown`), and everything else as JSON.

## AI

What is sent to the model (Anthropic API, from our server only):

- The dump being organized (or the onboarding answers).
- Workspace context so it can link correctly: client names, client email addresses, and status; project titles; the titles and due dates of up to 40 recent open tasks. No notes, no task bodies, no other users' data.
- Today's date and the user's timezone.

Safeguards:

- User and forwarded content is treated as untrusted data. It is delimited in the prompt (closing tags are escaped) and the model is told not to follow instructions inside it. Code guardrails then drop anything the input doesn't support (unknown ids, invented clients, implausible dates).
- Nothing changes in the workspace until the user accepts a proposal. Every accepted proposal can be undone.
- Inputs are capped at 20,000 characters, with a rate limit of 30 AI actions per workspace per hour.
- Function logs contain metrics only: action id, attempts, token counts, guardrail codes, latency. They never contain the dump, the proposal, or names.
- Proposals (and what was applied) are stored in `ai_actions` as the audit trail. They are deleted with the account.
