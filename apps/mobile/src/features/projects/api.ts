import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProjectInsert, type ProjectUpdate, type Tables } from '@notion2/shared';
import { keys, updateList, useDbWrite } from '@/lib/collection';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { useTrack } from '@/lib/analytics';
import { useWorkspaceId } from '@/features/auth/useMe';

export type Project = Tables<'projects'>;

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useProject(id: string | undefined) {
  const { data, ...rest } = useProjects();
  return { ...rest, data: data?.find((p) => p.id === id) };
}

export function useCreateProject() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const track = useTrack();
  const workspaceId = useWorkspaceId();
  return useCallback(
    (input: { title: string; client_id?: string | null; due_date?: string | null }) => {
      if (!workspaceId) return null;
      const parsed = ProjectInsert.parse({ id: newId(), workspace_id: workspaceId, ...input });
      const now = new Date().toISOString();
      const row: Project = {
        client_id: null,
        due_date: null,
        summary: null,
        ...parsed,
        created_at: now,
        updated_at: now,
      };
      updateList<Project>(qc, keys.projects, (rows) => [row, ...rows]);
      write({ op: 'insert', table: 'projects', rows: [row] });
      track('project_created');
      return row;
    },
    [qc, write, track, workspaceId],
  );
}

export function useUpdateProject() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (id: string, patch: ProjectUpdate) => {
      updateList<Project>(qc, keys.projects, (rows) =>
        rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
      write({ op: 'update', table: 'projects', id, patch });
    },
    [qc, write],
  );
}

export function useDeleteProject() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (id: string) => {
      updateList<Project>(qc, keys.projects, (rows) => rows.filter((r) => r.id !== id));
      updateList<Tables<'tasks'>>(qc, keys.tasks, (rows) =>
        rows.map((r) => (r.project_id === id ? { ...r, project_id: null } : r)),
      );
      write({ op: 'delete', table: 'projects', ids: [id] });
    },
    [qc, write],
  );
}
