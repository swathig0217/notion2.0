import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { todayInTimeZone, type ClientStatus } from '@notion2/shared';
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
import { useClient, useDeleteClient, useUpdateClient } from '@/features/clients/api';
import { useProjects } from '@/features/projects/api';
import { byPosition, useSnoozeTask, useTasks, useToggleTask } from '@/features/tasks/api';
import { TaskRow } from '@/features/tasks/TaskRow';
import { QuickAddTask } from '@/features/tasks/QuickAddTask';
import { useSubtaskProgress } from '@/features/tasks/useSubtaskProgress';
import { useCreateNote, useNotes } from '@/features/notes/api';
import { useTimeZone } from '@/features/auth/useMe';
import { toast } from '@/lib/toast';
import { confirmDestructive } from '@/lib/confirm';
import { TimeTotal } from '@/features/time/TimeTotal';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
] as const;

export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: client, isPending } = useClient(id);
  const update = useUpdateClient();
  const remove = useDeleteClient();
  const projects = useProjects();
  const tasks = useTasks();
  const notes = useNotes();
  const createNote = useCreateNote();
  const toggle = useToggleTask();
  const snooze = useSnoozeTask();
  const progress = useSubtaskProgress(tasks.data);
  const today = todayInTimeZone(useTimeZone());

  const clientProjects = useMemo(
    () => (projects.data ?? []).filter((p) => p.client_id === id && p.status !== 'archived'),
    [projects.data, id],
  );
  const openTasks = useMemo(
    () =>
      (tasks.data ?? [])
        .filter((t) => t.client_id === id && !t.parent_task_id && t.status !== 'done')
        .sort(byPosition),
    [tasks.data, id],
  );
  const clientNotes = useMemo(
    () => (notes.data ?? []).filter((n) => n.client_id === id),
    [notes.data, id],
  );

  if (isPending) return <ListSkeleton />;
  if (!client) {
    return (
      <EmptyState
        icon="user-x"
        title="Client not found"
        action={{ label: 'Back', onPress: () => router.back() }}
      />
    );
  }

  const lastContact = client.last_contacted_at
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
        new Date(client.last_contacted_at),
      )
    : 'never';

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon="trash-2"
              label="Delete client"
              onPress={() =>
                confirmDestructive(
                  'Delete client?',
                  'Their projects, tasks and notes are kept but unlinked.',
                  () => {
                    remove(client.id);
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
          <InlineTitle
            value={client.name}
            placeholder="Client name"
            onSave={(name) => update(client.id, { name })}
          />
          {client.email ? <Text variant="caption">{client.email}</Text> : null}
          <Segmented<ClientStatus>
            label="Client status"
            value={client.status}
            options={STATUS_OPTIONS}
            onChange={(status) => update(client.id, { status })}
          />
          <TimeTotal clientId={client.id} />
          <Button
            testID="write-update"
            label="Write an update"
            icon="edit-3"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/draft',
                params: { kind: 'client_update', clientId: client.id },
              })
            }
          />
          <View className="flex-row items-center justify-between">
            <Text variant="caption">Last contact: {lastContact}</Text>
            <Button
              label="Contacted today"
              variant="ghost"
              icon="message-circle"
              onPress={() => {
                update(client.id, { last_contacted_at: new Date().toISOString() });
                toast.show('Marked as contacted');
              }}
            />
          </View>
        </View>

        <SectionHeader
          title="Projects"
          right={
            <IconButton
              icon="plus"
              label="New project"
              color="accent"
              onPress={() =>
                router.push({ pathname: '/projects/new', params: { clientId: client.id } })
              }
            />
          }
        />
        {clientProjects.length === 0 ? (
          <Text variant="caption" className="px-4">
            No projects yet.
          </Text>
        ) : (
          <View className="gap-px bg-border">
            {clientProjects.map((p) => (
              <ListRow
                key={p.id}
                title={p.title}
                subtitle={p.status === 'active' ? null : p.status.replace('_', ' ')}
                onPress={() => router.push(`/projects/${p.id}`)}
              />
            ))}
          </View>
        )}

        <SectionHeader title="Open tasks" />
        <View className="gap-px bg-border">
          <QuickAddTask defaults={{ client_id: client.id }} />
          {openTasks.map((t) => (
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

        <SectionHeader
          title="Notes"
          right={
            <IconButton
              icon="edit-3"
              label="New note"
              color="accent"
              onPress={() => {
                const note = createNote({ client_id: client.id });
                if (note) router.push(`/notes/${note.id}`);
              }}
            />
          }
        />
        {clientNotes.length === 0 ? (
          <Text variant="caption" className="px-4">
            No notes yet.
          </Text>
        ) : (
          <View className="gap-px bg-border">
            {clientNotes.map((n) => (
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
