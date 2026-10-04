import { POSITION_STEP } from '../tasks/position.ts';
import { markdownToDoc } from './markdown-doc.ts';
import type { AiProposal, ProposedChange } from './schemas.ts';

/** What the user decided in the review sheet. */
export interface ReviewDecision {
  /** Refs of the changes the user kept checked. */
  selected: ReadonlySet<string>;
  /** Edited titles (task/project/note) or names (client), by ref. */
  titles?: Readonly<Record<string, string>>;
  /** Subtasks the user unticked: `${ref}:${index}`. */
  removedSubtasks?: ReadonlySet<string>;
}

export interface ApplyRows {
  clients: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  notes: Record<string, unknown>[];
}

export interface ApplyPlan {
  rows: ApplyRows;
  /** True if the user changed anything (status `edited` vs `accepted`). */
  edited: boolean;
  /** Number of rows that will be created (subtasks included). */
  count: number;
}

const APPLYABLE: ProposedChange['op'][] = [
  'create_client',
  'create_project',
  'create_task',
  'create_note',
];

export function isApplyable(change: ProposedChange): boolean {
  return APPLYABLE.includes(change.op);
}

/**
 * Turns a reviewed proposal into rows for `apply_ai_action`. Pure: ids come from `newId`
 * so the client can generate them (and tests can make them deterministic).
 */
export function planApply(
  proposal: AiProposal,
  decision: ReviewDecision,
  opts: {
    workspaceId: string;
    actionId: string;
    newId: () => string;
    lastTaskPosition: number | null;
  },
): ApplyPlan {
  const rows: ApplyRows = { clients: [], projects: [], tasks: [], notes: [] };
  const idForRef = new Map<string, string>();
  const ws = opts.workspaceId;
  let position = opts.lastTaskPosition ?? 0;
  let edited = false;

  const applyable = proposal.proposed_changes.filter(isApplyable);
  if (applyable.some((c) => !decision.selected.has(c.ref))) edited = true;

  const title = (c: ProposedChange, original: string) => {
    const override = decision.titles?.[c.ref]?.trim();
    if (override && override !== original) {
      edited = true;
      return override;
    }
    return original;
  };
  // An id field may hold an existing id or a ref to an entity created above.
  const resolve = (id: string | null): string | null => {
    if (id == null) return null;
    if (idForRef.has(id)) return idForRef.get(id) ?? null;
    const refOfProposal = proposal.proposed_changes.some((c) => c.ref === id);
    return refOfProposal ? null : id; // ref to an unselected change -> unlinked
  };

  for (const change of applyable) {
    if (!decision.selected.has(change.ref)) continue;
    const id = opts.newId();
    idForRef.set(change.ref, id);

    switch (change.op) {
      case 'create_client':
        rows.clients.push({
          id,
          workspace_id: ws,
          name: title(change, change.name),
          email: change.email,
        });
        break;
      case 'create_project':
        rows.projects.push({
          id,
          workspace_id: ws,
          title: title(change, change.title),
          client_id: resolve(change.client_id),
          due_date: change.due_date,
        });
        break;
      case 'create_task': {
        position += POSITION_STEP;
        const task = {
          id,
          workspace_id: ws,
          title: title(change, change.title),
          notes: change.notes,
          client_id: resolve(change.client_id),
          project_id: resolve(change.project_id),
          parent_task_id: null,
          due_date: change.due_date,
          priority: change.priority,
          position,
          source: 'ai',
          ai_action_id: opts.actionId,
        };
        rows.tasks.push(task);
        change.subtasks.forEach((subtask, i) => {
          if (decision.removedSubtasks?.has(`${change.ref}:${i}`)) {
            edited = true;
            return;
          }
          rows.tasks.push({
            ...task,
            id: opts.newId(),
            title: subtask,
            notes: null,
            parent_task_id: id,
            due_date: null,
            priority: 'none',
            position: (i + 1) * POSITION_STEP,
          });
        });
        break;
      }
      case 'create_note':
        rows.notes.push({
          id,
          workspace_id: ws,
          title: title(change, change.title),
          content: markdownToDoc(change.content),
          content_text: change.content,
          client_id: resolve(change.client_id),
          project_id: resolve(change.project_id),
          ai_action_id: opts.actionId,
        });
        break;
      default:
        break;
    }
  }

  const count = rows.clients.length + rows.projects.length + rows.tasks.length + rows.notes.length;
  return { rows, edited, count };
}
