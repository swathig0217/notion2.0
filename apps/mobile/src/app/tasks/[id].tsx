import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  addDays,
  formatDueLabel,
  nextWeekday,
  todayInTimeZone,
  type TaskPriority,
  type TaskStatus,
} from '@notion2/shared';
import {
  Checkbox,
  EmptyState,
  Icon,
  IconButton,
  ListSkeleton,
  SectionHeader,
  Text,
} from '@/components/ui';
import { Segmented } from '@/components/Segmented';
import { SmartPasteInput } from '@/components/SmartPasteInput';
import {
  useCreateSubtasks,
  useCreateTask,
  useDeleteTask,
  useSubtasks,
  useTask,
  useToggleTask,
  useUpdateTask,
} from '@/features/tasks/api';
import { useClient } from '@/features/clients/api';
import { useProject } from '@/features/projects/api';
import { useTimeZone } from '@/features/auth/useMe';
import { useTrack } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import { TaskTimeSection } from '@/features/time/TaskTimeSection';

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'med', label: 'Med' },
  { value: 'high', label: 'High' },
] as const;

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      aria-selected={selected}
      accessibilityLabel={`Due ${label}`}
      onPress={onPress}
      className={`min-h-[36px] justify-center rounded-full px-4 ${selected ? 'bg-accent' : 'bg-surface-2'}`}
    >
      <Text variant="caption" className={selected ? 'font-semibold text-on-accent' : 'text-text'}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: task, isPending } = useTask(id);
  const subtasks = useSubtasks(id);
  const { data: client } = useClient(task?.client_id ?? undefined);
  const { data: project } = useProject(task?.project_id ?? undefined);
  const update = useUpdateTask();
  const toggle = useToggleTask();
  const createTask = useCreateTask();
  const createSubtasks = useCreateSubtasks();
  const remove = useDeleteTask();
  const track = useTrack();
  const today = todayInTimeZone(useTimeZone());

  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [newSubtask, setNewSubtask] = useState('');
  useEffect(() => setTitle(task?.title ?? ''), [task?.title]);
  useEffect(() => setNotes(task?.notes ?? ''), [task?.notes]);

  if (isPending) return <ListSkeleton />;
  if (!task) {
    return (
      <EmptyState
        icon="check-circle"
        title="Task not found"
        action={{ label: 'Back', onPress: () => router.back() }}
      />
    );
  }

  const saveTitle = () => {
    const next = title.trim();
    if (!next) setTitle(task.title);
    else if (next !== task.title) update(task.id, { title: next });
  };
  const saveNotes = () => {
    if (notes !== (task.notes ?? '')) update(task.id, { notes: notes || null });
  };
  const addSubtasksFromPaste = (items: Parameters<typeof createSubtasks>[1]) => {
    createSubtasks(task, items);
    track('checklist_from_paste', { items: items.length, target: 'subtasks' });
    toast.show(`Added ${items.length} checklist items`);
  };
  const addSubtask = () => {
    const t = newSubtask.trim();
    if (!t) return;
    createTask({
      title: t,
      parent_task_id: task.id,
      client_id: task.client_id,
      project_id: task.project_id,
    });
    setNewSubtask('');
  };

  const dueOptions = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: 'Next week', value: nextWeekday(today, 1) },
    { label: 'None', value: null },
  ];
  const customDue = task.due_date != null && !dueOptions.some((o) => o.value === task.due_date);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon="trash-2"
              label="Delete task"
              onPress={() => {
                remove(task.id);
                router.back();
              }}
            />
          ),
        }}
      />
      <ScrollView
        className="flex-1 bg-bg"
        contentContainerClassName="gap-1 pb-24"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-start gap-3 px-4 pt-2">
          <View className="pt-1.5">
            <Checkbox
              checked={task.status === 'done'}
              label={`Complete ${task.title}`}
              onToggle={() => toggle(task)}
              size={28}
            />
          </View>
          <View className="flex-1">
            <SmartPasteInput
              testID="task-title"
              value={title}
              onChangeText={setTitle}
              onBlur={saveTitle}
              onSubmitEditing={saveTitle}
              accessibilityLabel="Task title"
              placeholder="Task title"
              className="text-[22px] font-semibold leading-[28px]"
              onChecklist={addSubtasksFromPaste}
            />
          </View>
        </View>

        {client || project ? (
          <View className="flex-row flex-wrap gap-2 px-4 pt-1">
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
            {project ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(`/projects/${project.id}`)}
              >
                <Text variant="caption" className="text-accent">
                  {client ? '· ' : ''}
                  {project.title}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <SectionHeader title="Status" />
        <View className="px-4">
          <Segmented<TaskStatus>
            label="Status"
            value={task.status}
            options={STATUS_OPTIONS}
            onChange={(status) =>
              status === 'done' || task.status === 'done'
                ? toggle(task)
                : update(task.id, { status })
            }
          />
        </View>

        <SectionHeader title="Due" />
        <View className="flex-row flex-wrap gap-2 px-4">
          {dueOptions.map((o) => (
            <Chip
              key={o.label}
              label={o.label}
              selected={task.due_date === o.value}
              onPress={() => update(task.id, { due_date: o.value })}
            />
          ))}
          {customDue && task.due_date ? (
            <Chip label={formatDueLabel(task.due_date, today)} selected onPress={() => {}} />
          ) : null}
        </View>

        <SectionHeader title="Priority" />
        <View className="px-4">
          <Segmented<TaskPriority>
            label="Priority"
            value={task.priority}
            options={PRIORITY_OPTIONS}
            onChange={(priority) => update(task.id, { priority })}
          />
        </View>

        <SectionHeader
          title={`Checklist${subtasks.length ? ` · ${subtasks.filter((s) => s.status === 'done').length}/${subtasks.length}` : ''}`}
        />
        <View className="gap-px bg-border">
          {subtasks.map((s) => (
            <View
              key={s.id}
              className="min-h-[48px] flex-row items-center gap-3 bg-surface px-4 py-2"
              testID={`subtask-${s.id}`}
            >
              <Checkbox
                checked={s.status === 'done'}
                label={`Complete ${s.title}`}
                onToggle={() => toggle(s)}
                size={22}
              />
              <Text className={`flex-1 ${s.status === 'done' ? 'text-faint line-through' : ''}`}>
                {s.title}
              </Text>
              <IconButton icon="x" label={`Remove ${s.title}`} onPress={() => remove(s.id)} />
            </View>
          ))}
          <View className="flex-row items-start gap-3 bg-surface px-4 py-3">
            <View className="pt-0.5">
              <Icon name="plus" size={20} color="accent" />
            </View>
            <View className="flex-1">
              <SmartPasteInput
                testID="add-subtask"
                value={newSubtask}
                onChangeText={setNewSubtask}
                onSubmitEditing={addSubtask}
                placeholder="Add an item, or paste a list"
                accessibilityLabel="Add checklist item"
                returnKeyType="done"
                onChecklist={addSubtasksFromPaste}
              />
            </View>
          </View>
        </View>

        <TaskTimeSection task={task} />

        <SectionHeader title="Notes" />
        <View className="mx-4 rounded-xl bg-surface px-4 py-3">
          <SmartPasteInput
            testID="task-notes"
            value={notes}
            onChangeText={setNotes}
            onBlur={saveNotes}
            allowNewlines
            placeholder="Details, links, context…"
            accessibilityLabel="Task notes"
            className="min-h-[96px]"
            textAlignVertical="top"
            onChecklist={addSubtasksFromPaste}
          />
        </View>
      </ScrollView>
    </>
  );
}
