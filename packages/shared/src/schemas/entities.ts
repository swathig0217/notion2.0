import { z } from 'zod';
import {
  ClientStatus,
  InboxKind,
  InboxStatus,
  ProjectStatus,
  TaskPriority,
  TaskSource,
  TaskStatus,
} from './enums';

/** YYYY-MM-DD calendar date (no time, no timezone). */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const Uuid = z.uuid();

const title = z.string().trim().min(1, 'Required').max(500);
const longText = z.string().max(20_000);

// Insert shapes. IDs are generated on the client so offline creates stay stable.

export const ClientInsert = z.object({
  id: Uuid,
  workspace_id: Uuid,
  name: z.string().trim().min(1, 'Required').max(200),
  email: z.email().nullable().optional(),
  notes: longText.nullable().optional(),
  status: ClientStatus.default('active'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});
export const ClientUpdate = ClientInsert.omit({ id: true, workspace_id: true })
  .partial()
  .extend({ last_contacted_at: z.iso.datetime({ offset: true }).nullable().optional() });

export const ProjectInsert = z.object({
  id: Uuid,
  workspace_id: Uuid,
  client_id: Uuid.nullable().optional(),
  title,
  status: ProjectStatus.default('active'),
  due_date: IsoDate.nullable().optional(),
  summary: longText.nullable().optional(),
});
export const ProjectUpdate = ProjectInsert.omit({ id: true, workspace_id: true }).partial();

export const TaskInsert = z.object({
  id: Uuid,
  workspace_id: Uuid,
  project_id: Uuid.nullable().optional(),
  client_id: Uuid.nullable().optional(),
  parent_task_id: Uuid.nullable().optional(),
  title,
  notes: longText.nullable().optional(),
  status: TaskStatus.default('todo'),
  due_date: IsoDate.nullable().optional(),
  priority: TaskPriority.default('none'),
  position: z.number().finite(),
  source: TaskSource.default('manual'),
});
export const TaskUpdate = TaskInsert.omit({ id: true, workspace_id: true, source: true })
  .partial()
  .extend({ completed_at: z.iso.datetime({ offset: true }).nullable().optional() });

export const NoteInsert = z.object({
  id: Uuid,
  workspace_id: Uuid,
  client_id: Uuid.nullable().optional(),
  project_id: Uuid.nullable().optional(),
  title: z.string().max(500).default(''),
  content: z.record(z.string(), z.unknown()).nullable().optional(),
  content_text: z.string().max(200_000).default(''),
});
export const NoteUpdate = NoteInsert.omit({ id: true, workspace_id: true }).partial();

/** Max characters accepted for a single inbox dump. */
export const INBOX_MAX_CHARS = 20_000;

export const InboxItemInsert = z.object({
  id: Uuid,
  workspace_id: Uuid,
  kind: InboxKind.default('text'),
  raw_content: z.string().trim().min(1).max(INBOX_MAX_CHARS),
  status: InboxStatus.default('pending'),
});

export type ClientInsert = z.input<typeof ClientInsert>;
export type ClientUpdate = z.input<typeof ClientUpdate>;
export type ProjectInsert = z.input<typeof ProjectInsert>;
export type ProjectUpdate = z.input<typeof ProjectUpdate>;
export type TaskInsert = z.input<typeof TaskInsert>;
export type TaskUpdate = z.input<typeof TaskUpdate>;
export type NoteInsert = z.input<typeof NoteInsert>;
export type NoteUpdate = z.input<typeof NoteUpdate>;
export type InboxItemInsert = z.input<typeof InboxItemInsert>;
