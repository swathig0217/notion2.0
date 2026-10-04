import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatDueLabel } from '@notion2/shared';
import { Checkbox, SwipeRow, Text } from '@/components/ui';
import type { Task } from './api';

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-danger',
  med: 'bg-warning',
  low: 'bg-faint',
};

export interface TaskRowProps {
  task: Task;
  today: string;
  subtitle?: string | null;
  subtaskProgress?: { done: number; total: number } | null;
  onToggle: (task: Task) => void;
  onSnooze?: (task: Task) => void;
}

export const TaskRow = memo(function TaskRow({
  task,
  today,
  subtitle,
  subtaskProgress,
  onToggle,
  onSnooze,
}: TaskRowProps) {
  const done = task.status === 'done';
  const overdue = !done && task.due_date != null && task.due_date < today;
  const meta = [
    task.due_date && task.due_date !== today ? formatDueLabel(task.due_date, today) : null,
    subtitle,
    subtaskProgress && subtaskProgress.total > 0
      ? `${subtaskProgress.done}/${subtaskProgress.total}`
      : null,
  ].filter(Boolean);

  return (
    <SwipeRow
      right={{
        label: done ? 'Reopen' : 'Done',
        icon: done ? 'rotate-ccw' : 'check',
        onTrigger: () => onToggle(task),
      }}
      left={
        onSnooze && !done
          ? { label: 'Tomorrow', icon: 'sunrise', onTrigger: () => onSnooze(task) }
          : undefined
      }
    >
      <Pressable
        testID={`task-row-${task.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}${done ? ', done' : ''}${overdue ? ', overdue' : ''}`}
        accessibilityHint="Opens the task. Swipe right to complete."
        onPress={() => router.push(`/tasks/${task.id}`)}
        className="min-h-[56px] flex-row items-center gap-3 bg-surface px-4 py-3 active:bg-surface-2"
      >
        <Checkbox checked={done} label={`Complete ${task.title}`} onToggle={() => onToggle(task)} />
        <View className="flex-1">
          <Text numberOfLines={2} className={done ? 'text-faint line-through' : ''}>
            {task.title}
          </Text>
          {meta.length > 0 ? (
            <Text variant="caption" numberOfLines={1} className={overdue ? 'text-danger' : ''}>
              {meta.join(' · ')}
            </Text>
          ) : null}
        </View>
        {PRIORITY_DOT[task.priority] && !done ? (
          <View
            accessibilityLabel={`${task.priority} priority`}
            className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority]}`}
          />
        ) : null}
      </Pressable>
    </SwipeRow>
  );
});
