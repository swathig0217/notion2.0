import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { todayInTimeZone, type ProjectStatus } from '@notion2/shared';
import {
  Button,
  EmptyState,
  IconButton,
  ListRow,
  ListSkeleton,
  SectionHeader,
  Text,
} from '@/components/ui';
import { InlineTitle } from '@/components/InlineTitle';
import { Segmented } from '@/components/Segmented';
import { useDeleteProject, useProject, useUpdateProject } from '@/features/projects/api';
import { useClient } from '@/features/clients/api';
import { byPosition, useSnoozeTask, useTasks, useToggleTask } from '@/features/tasks/api';
import { TaskRow } from '@/features/tasks/TaskRow';
import { QuickAddTask } from '@/features/tasks/QuickAddTask';
import { useSubtaskProgress } from '@/features/tasks/useSubtaskProgress';
import { useCreateNote, useNotes } from '@/features/notes/api';
import { useTimeZone } from '@/features/auth/useMe';
import { confirmDestructive } from '@/lib/confirm';
import { TimeTotal } from '@/features/time/TimeTotal';
import { ShareProjectSection } from '@/features/client-view/ShareProjectSection';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'done', label: 'Done' },
] as const;

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, isPending } = useProject(id);
  const { data: client } = useClient(project?.client_id ?? undefined);
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const tasks = useTasks();
  const notes = useNotes();
  const createNote = useCreateNote();
  const toggle = useToggleTask();
  const snooze = useSnoozeTask();
  const progress = useSubtaskProgress(tasks.data);
  const today = todayInTimeZone(useTimeZone());
  const [showDone, setShowDone] = useState(false);

  const projectTasks = useMemo(
    () =>
      (tasks.data ?? []).filter((t) => t.project_id === id && !t.parent_task_id).sort(byPosition),
    [tasks.data, id],
  );
  const open = projectTasks.filter((t) => t.status !== 'done');
  const done = projectTasks.filter((t) => t.status === 'done');
  const projectNotes = useMemo(
    () => (notes.data ?? []).filter((n) => n.project_id === id),
    [notes.data, id],
  );

  if (isPending) return <ListSkeleton />;
  if (!project) {
    return (
      <EmptyState
        icon="folder"
        title="Project not found"
        action={{ label: 'Back', onPress: () => router.back() }}
      />
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon="trash-2"
              label="Delete project"
              onPress={() =>
                confirmDestructive(
                  'Delete project?',
                  'Its tasks and notes are kept but unlinked.',
                  () => {
                    remove(project.id);
                    router.back();
                  },
                )
              }
            />
          ),
        }}
      />
      <ScrollView
        className="flex-1 bg-bg"
        contentContainerClassName="pb-24"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3 px-4 pt-2">
          {client ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(`/clients/${client.id}`)}
            >
              <Text variant="caption" className="text-accent">
                {client.name}
              </Text>
            </Pressable>
          ) : null}
          <InlineTitle
            value={project.title}
            placeholder="Project name"
            onSave={(title) => update(project.id, { title })}
          />
          <Segmented<ProjectStatus>
            label="Project status"
            value={project.status === 'archived' ? 'done' : project.status}
            options={STATUS_OPTIONS}
            onChange={(status) => update(project.id, { status })}
          />
          <TimeTotal projectId={project.id} />
          {project.client_id ? (
            <Button
              label="Write an update"
              icon="edit-3"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/draft',
                  params: {
                    kind: 'client_update',
                    clientId: project.client_id ?? '',
                    projectId: project.id,
                  },
                })
              }
            />
          ) : null}
        </View>

        <SectionHeader title={`Tasks · ${open.length} open`} />
        <View className="gap-px bg-border">
          <QuickAddTask defaults={{ project_id: project.id, client_id: project.client_id }} />
          {open.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              subtaskProgress={progress.get(t.id)}
              onToggle={toggle}
              onSnooze={snooze}
            />
          ))}
        </View>
        {done.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowDone((v) => !v)}
            className="px-4 py-3"
          >
            <Text variant="caption" className="text-accent">
              {showDone ? 'Hide' : 'Show'} {done.length} completed
            </Text>
          </Pressable>
        ) : null}
        {showDone ? (
          <View className="gap-px bg-border">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} today={today} onToggle={toggle} />
            ))}
          </View>
        ) : null}

        <ShareProjectSection projectId={project.id} />

        <SectionHeader
          title="Notes"
          right={
            <IconButton
              icon="edit-3"
              label="New note"
              color="accent"
              onPress={() => {
                const note = createNote({ project_id: project.id, client_id: project.client_id });
                if (note) router.push(`/notes/${note.id}`);
              }}
            />
          }
        />
        {projectNotes.length === 0 ? (
          <Text variant="caption" className="px-4">
            No notes yet.
          </Text>
        ) : (
          <View className="gap-px bg-border">
            {projectNotes.map((n) => (
              <ListRow
                key={n.id}
                title={n.title || 'Untitled'}
                onPress={() => router.push(`/notes/${n.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}
