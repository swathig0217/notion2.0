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

## Phase 3 data

- **Screenshots/photos** are stored in a private Storage bucket (`inbox`), in a per-workspace folder only workspace members can read. They're sent to the model only when organizing that item. They're deleted on account deletion.
- **Forwarded emails** are received by Postmark and posted to our `inbound-email` function. The text (sender, subject, date, plain body, capped at 20,000 characters) becomes an inbox item. Attachments are ignored. Anyone who knows a workspace's forwarding address can send to it, so the address is secret, can be regenerated in Settings, and is rate-capped.
- **Push notifications** go through Expo's push service. The daily digest can include the titles of up to two due tasks and a client's name (shown on the lock screen). Users can turn digests and nudges off in Settings. Device tokens are deleted with the account and when Expo reports them unregistered.
- **Drafts and briefs** are stored in `ai_actions` like proposals (audit). Drafts are never sent by us.
- **Time entries** are workspace data like tasks.

## Error reporting (Sentry)

- `sendDefaultPii: false`.
- Breadcrumbs from the console and UI text are dropped, and request bodies are stripped.
- Errors are tagged with table and operation names only (`lib/sentry.ts`).

## Deletion and export

- **Account deletion** (`Settings → Delete account`) calls `public.delete_my_account()`. It deletes the auth user, and every table cascades from it: profile, workspace, and all workspace data including `ai_actions` and `events`. This is covered by RLS tests.
- **Data export** (`Settings → Export my data`): one JSON file with every table the user can see (`EXPORT_TABLES` in `packages/shared/src/export`), notes also as Markdown, and uploaded images as signed links valid for 7 days. It is built on the device through RLS and never stored on our servers. Push tokens are the only table left out (device credentials, not user content).
- **Completeness is tested:** a Vitest test fails if a migration creates a table that is neither exported nor explicitly excluded, and a pgTAP test checks the table inventory and that account deletion leaves no row with the user's workspace id in any table.
- **Invoices** snapshot the client's name and email at creation so a sent invoice stays readable; they are workspace data and are deleted with the account.
- **Subscriptions** hold plan, status, provider ids and renewal date only, never payment details (those stay with the store or Stripe).
- **Shared content** from the OS share sheet is held in memory until the user taps "Dump it"; it is never persisted outside the Inbox.
- **Client links** (`share_links`): anyone with a link can read one project's title, status, due date, client name, the owner's display name, and the titles, statuses and due dates of its visible top-level tasks. Nothing else is returned (allowlist in `buildClientView`). Links are revocable instantly, counted (views and last view time, no visitor data), and deleted with the project or account. The public page is never stored in the visitor's browser cache by the app.
- **Calendar feed** (`workspaces.calendar_token`, off by default): anyone with the URL can read titles and due dates of open tasks, active projects and sent invoices (invoice number and client name, no amounts). The user turns it on, can replace it, and can turn it off.
- **Webhooks** send the events the user picks to the URL they enter: task title, status, due date, priority, client and project names; client name and email; invoice number, status, dates, currency and total. Never notes. Each request is HMAC-signed. The delivery log (`webhook_deliveries`, payloads included) is kept for 30 days and deleted with the account.
- **Launch metrics** (`analytics` schema) aggregate `events` (names and counts, no content) and are not exposed through the API.

## AI

What is sent to the model (Anthropic API, from our server only):

- The dump being organized (or the onboarding answers).
- Workspace context so it can link correctly: client names, client email addresses, and status; project titles; the titles and due dates of up to 40 recent open tasks. No notes, no task bodies, no other users' data.
- For client updates and follow-ups: titles of that client's recent tasks, up to 5 note excerpts (500 characters each), minutes logged, the user's name and preferred tone.
- For the Weekly Brief: titles, due dates, priorities and status of open tasks, plus client names and days since contact.
- Today's date and the user's timezone.

Safeguards:

- User and forwarded content is treated as untrusted data. It is delimited in the prompt (closing tags are escaped) and the model is told not to follow instructions inside it. Code guardrails then drop anything the input doesn't support (unknown ids, invented clients, implausible dates).
- Nothing changes in the workspace until the user accepts a proposal. Every accepted proposal can be undone.
- Inputs are capped at 20,000 characters, with a rate limit of 30 AI actions per workspace per hour.
- Function logs contain metrics only: action id, attempts, token counts, guardrail codes, latency. They never contain the dump, the proposal, or names.
- Proposals (and what was applied) are stored in `ai_actions` as the audit trail. They are deleted with the account.
