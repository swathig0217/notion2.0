import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatClock } from '@notion2/shared';
import { Icon, Text } from '@/components/ui';
import { useTask } from '@/features/tasks/api';
import { useRunningEntry, useStopTimer } from './api';
import { useNow } from './useNow';

/** Slim bar shown while a timer runs, so it's never forgotten. */
export function TimerBar() {
  const running = useRunningEntry();
  const { data: task } = useTask(running?.task_id ?? undefined);
  const stop = useStopTimer();
  const now = useNow(running != null);
  if (!running) return null;
  const seconds = (now.getTime() - new Date(running.started_at).getTime()) / 1000;
  return (
    <View
      className="flex-row items-center gap-3 border-t border-border bg-accent-soft px-4 py-2"
      accessibilityLiveRegion="none"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Timer running on ${task?.title ?? 'a task'}. Open task`}
        onPress={() => running.task_id && router.push(`/tasks/${running.task_id}`)}
        className="flex-1 flex-row items-center gap-2"
      >
        <View className="h-2 w-2 rounded-full bg-danger" />
        <Text numberOfLines={1} className="flex-1">
          {task?.title ?? 'Timer'}
        </Text>
        <Text testID="timer-clock" className="font-semibold tabular-nums">
          {formatClock(seconds)}
        </Text>
      </Pressable>
      <Pressable
        testID="timer-bar-stop"
        accessibilityRole="button"
        accessibilityLabel="Stop timer"
        hitSlop={8}
        onPress={stop}
        className="h-9 w-9 items-center justify-center rounded-full bg-accent"
      >
        <Icon name="square" size={14} color="on-accent" />
      </Pressable>
    </View>
  );
}
