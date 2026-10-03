# DECISIONS.md

Small decisions made without a dedicated approval step. Format: date, decision, why. Larger decisions go in `PLAN.md` and wait for approval.

| Date | Decision | Why |
|---|---|---|
| 2026-10-03 | pnpm workspaces monorepo (`apps/mobile`, `packages/shared`, `supabase/`, `evals/`) | One repo, with Zod schemas shared between the client and edge functions |
| 2026-10-03 | Client-generated UUIDs for all rows | Offline creates keep stable IDs; subtasks can reference parents before sync |
| 2026-10-03 | `tasks.position` is a float (fractional indexing) | Reordering rewrites only one row |
| 2026-10-03 | Default `ANTHROPIC_MODEL` = `claude-sonnet-5-5` | The brief asks for a current Sonnet model. It's overridable via env |
| 2026-10-03 | Notes stored as ProseMirror JSON + derived `content_text` | Lossless for the editor; plain text for AI context and search |
| 2026-10-03 | Default "needs follow-up" threshold N = 7 days | Simplest reasonable default; it can be made a setting later |
| 2026-10-03 | Phase 1 runs against local Supabase only | No hosted credentials needed to build and test the foundation |
