import { z } from 'zod';

// Keep in sync with the Postgres enums in supabase/migrations.
export const ClientStatus = z.enum(['active', 'paused', 'archived']);
export const ProjectStatus = z.enum(['active', 'on_hold', 'done', 'archived']);
export const TaskStatus = z.enum(['todo', 'doing', 'done']);
export const TaskPriority = z.enum(['none', 'low', 'med', 'high']);
export const TaskSource = z.enum(['manual', 'ai']);
export const InboxKind = z.enum(['text', 'voice', 'email', 'image']);
export const InboxStatus = z.enum(['pending', 'processed', 'dismissed']);
export const AiActionStatus = z.enum(['proposed', 'accepted', 'rejected', 'edited', 'undone']);
export const MemberRole = z.enum(['owner', 'member']);

export type ClientStatus = z.infer<typeof ClientStatus>;
export type ProjectStatus = z.infer<typeof ProjectStatus>;
export type TaskStatus = z.infer<typeof TaskStatus>;
export type TaskPriority = z.infer<typeof TaskPriority>;
export type TaskSource = z.infer<typeof TaskSource>;
export type InboxKind = z.infer<typeof InboxKind>;
export type InboxStatus = z.infer<typeof InboxStatus>;
export type AiActionStatus = z.infer<typeof AiActionStatus>;
export type MemberRole = z.infer<typeof MemberRole>;
