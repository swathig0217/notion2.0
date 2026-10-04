import { addDays, isIsoDate } from '../dates/dates.ts';
import type { WorkspaceContext } from './context.ts';
import type { AiProposal, ProposedChange } from './schemas.ts';

export const PROPOSAL_LIMITS = {
  changes: 30,
  subtasks: 50,
  title: 200,
  notes: 5000,
  body: 5000,
  question: 300,
} as const;

export interface SanitizeOptions {
  context: WorkspaceContext;
  /** The raw user input, used to check that new clients are actually mentioned in it. */
  rawInput: string;
  /** Onboarding may create (sample) clients freely; inbox processing may not invent them. */
  newClients: 'if_mentioned' | 'always';
}

export interface SanitizeResult {
  proposal: AiProposal;
  /** Machine-readable notes on what was corrected (no user content). */
  issues: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => s.trim().slice(0, n);

function validDate(value: string | null, today: string, issues: string[]): string | null {
  if (value == null) return null;
  if (!isIsoDate(value)) {
    issues.push('invalid_date');
    return null;
  }
  // Anything over a year ago or three years out is almost certainly a misread.
  if (value < addDays(today, -365) || value > addDays(today, 3 * 365)) {
    issues.push('implausible_date');
    return null;
  }
  return value;
}

/**
 * Enforces the AI guardrails on a schema-valid proposal: never invent clients or ids,
 * never keep an unparseable date, cap sizes, and keep refs consistent. The model is
 * told the same rules; this makes them hold even when it slips.
 */
export function sanitizeProposal(input: AiProposal, opts: SanitizeOptions): SanitizeResult {
  const { context } = opts;
  const issues: string[] = [];
  const clientIds = new Set(context.clients.map((c) => c.id));
  const projectIds = new Set(context.projects.map((p) => p.id));
  const projectClient = new Map(context.projects.map((p) => [p.id, p.client_id]));
  // ref -> existing id when a proposed entity duplicates an existing one.
  const remap = new Map<string, string | null>();
  const seenRefs = new Set<string>();
  const out: ProposedChange[] = [];
  const raw = norm(opts.rawInput);

  const resolveClient = (id: string | null): string | null => {
    if (id == null) return null;
    if (remap.has(id)) return remap.get(id) ?? null;
    if (clientIds.has(id)) return id;
    issues.push('unknown_client_id');
    return null;
  };
  const resolveProject = (id: string | null): string | null => {
    if (id == null) return null;
    if (remap.has(id)) return remap.get(id) ?? null;
    if (projectIds.has(id)) return id;
    issues.push('unknown_project_id');
    return null;
  };

  for (const change of input.proposed_changes) {
    if (out.length >= PROPOSAL_LIMITS.changes) {
      issues.push('too_many_changes');
      break;
    }
    let ref = clip(change.ref, 20) || `c${out.length + 1}`;
    if (seenRefs.has(ref)) {
      issues.push('duplicate_ref');
      ref = `${ref}_${out.length + 1}`;
    }

    switch (change.op) {
      case 'create_client': {
        const name = clip(change.name, PROPOSAL_LIMITS.title);
        if (!name) continue;
        const existing = context.clients.find((c) => norm(c.name) === norm(name));
        if (existing) {
          issues.push('client_already_exists');
          remap.set(change.ref, existing.id);
          continue;
        }
        if (opts.newClients === 'if_mentioned' && !raw.includes(norm(name))) {
          issues.push('invented_client_dropped');
          remap.set(change.ref, null);
          continue;
        }
        const email =
          change.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(change.email) ? change.email : null;
        out.push({ ...change, ref, name, email });
        clientIds.add(ref);
        break;
      }
      case 'create_project': {
        const title = clip(change.title, PROPOSAL_LIMITS.title);
        if (!title) continue;
        const client_id = resolveClient(change.client_id);
        const existing = context.projects.find(
          (p) => norm(p.title) === norm(title) && (client_id == null || p.client_id === client_id),
        );
        if (existing) {
          issues.push('project_already_exists');
          remap.set(change.ref, existing.id);
          continue;
        }
        out.push({
          ...change,
          ref,
          title,
          client_id,
          due_date: validDate(change.due_date, context.today, issues),
        });
        projectIds.add(ref);
        break;
      }
      case 'create_task': {
        const title = clip(change.title, PROPOSAL_LIMITS.title);
        if (!title) continue;
        const project_id = resolveProject(change.project_id);
        let client_id = resolveClient(change.client_id);
        // A task in a known project belongs to that project's client.
        if (client_id == null && project_id != null && projectClient.get(project_id)) {
          client_id = projectClient.get(project_id) ?? null;
        }
        const subtasks = change.subtasks
          .map((s) => clip(s, PROPOSAL_LIMITS.title))
          .filter(Boolean)
          .slice(0, PROPOSAL_LIMITS.subtasks);
        out.push({
          ...change,
          ref,
          title,
          notes: change.notes ? clip(change.notes, PROPOSAL_LIMITS.notes) || null : null,
          client_id,
          project_id,
          due_date: validDate(change.due_date, context.today, issues),
          subtasks,
        });
        break;
      }
      case 'create_note': {
        const content = clip(change.content, PROPOSAL_LIMITS.body);
        if (!content) continue;
        out.push({
          ...change,
          ref,
          title: clip(change.title, PROPOSAL_LIMITS.title) || 'Note',
          content,
          client_id: resolveClient(change.client_id),
          project_id: resolveProject(change.project_id),
        });
        break;
      }
      case 'draft_reply': {
        const body = clip(change.body, PROPOSAL_LIMITS.body);
        if (!body) continue;
        out.push({ ...change, ref, body, to_client_id: resolveClient(change.to_client_id) });
        break;
      }
    }
    seenRefs.add(ref);
    // Later changes that used the original ref keep pointing at this one.
    if (ref !== change.ref) remap.set(change.ref, ref);
  }

  const question = input.questions.map((q) => clip(q, PROPOSAL_LIMITS.question)).find(Boolean);
  return {
    proposal: {
      summary: clip(input.summary, 300) || 'Proposed changes',
      proposed_changes: out,
      questions: question ? [question] : [],
      confidence: Number.isFinite(input.confidence)
        ? Math.min(1, Math.max(0, input.confidence))
        : 0,
    },
    issues,
  };
}

/** The guaranteed-safe result when the model can't produce a valid proposal. */
export function fallbackProposal(rawInput: string): AiProposal {
  const lines = rawInput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const first = (lines[0] ?? 'Untitled').replace(/^[-*•\d.)\s]+/, '').trim() || 'Untitled';
  const title = first.length > 120 ? `${first.slice(0, 117)}…` : first;
  const notes =
    lines.length > 1 || first.length > 120 ? rawInput.trim().slice(0, PROPOSAL_LIMITS.notes) : null;
  return {
    summary: "Saved as one task. The assistant couldn't organize this one automatically.",
    proposed_changes: [
      {
        op: 'create_task',
        ref: 'c1',
        title,
        notes,
        client_id: null,
        project_id: null,
        due_date: null,
        priority: 'none',
        subtasks: [],
      },
    ],
    questions: [],
    confidence: 0,
  };
}
