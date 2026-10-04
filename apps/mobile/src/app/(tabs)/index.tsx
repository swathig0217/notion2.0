import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  EmptyState,
  IconButton,
  ListRow,
  ListSkeleton,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { ClientAvatar } from '@/features/clients/ClientAvatar';
import { useToday } from '@/features/today/useToday';
import { TaskRow } from '@/features/tasks/TaskRow';
import { QuickAddTask } from '@/features/tasks/QuickAddTask';
import { useSnoozeTask, useToggleTask } from '@/features/tasks/api';
import { useSubtaskProgress } from '@/features/tasks/useSubtaskProgress';

function formatHeaderDate(today: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${today}T00:00:00Z`));
}

export default function TodayScreen() {
  const { view, today, tasks, isLoading, refetch } = useToday();
  const toggle = useToggleTask();
  const snooze = useSnoozeTask();
  const progress = useSubtaskProgress(tasks);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const open = view.overdueCount + view.dueTodayCount;
  const subtitle = isLoading
    ? formatHeaderDate(today)
    : `${formatHeaderDate(today)} · ${open === 0 ? 'All clear' : `${open} to do`}`;

  return (
    <Screen
      title="Today"
      subtitle={subtitle}
      right={
        <IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
      }
    >
      <ScrollView
        contentContainerClassName="pb-40"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mt-2 overflow-hidden">
          <QuickAddTask defaults={{ due_date: today }} placeholder="Add a task for today" />
        </View>

        {isLoading ? (
          <ListSkeleton />
        ) : view.groups.length === 0 ? (
          <EmptyState
            icon="sun"
            title="Nothing due today"
            body="Add a task above, or paste a list to turn it into tasks."
          />
        ) : (
          view.groups.map((group) => (
            <View key={group.client?.id ?? 'none'}>
              <SectionHeader
                title={group.client?.name ?? 'No client'}
                right={
                  group.client?.color ? (
                    <View
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: group.client.color }}
                    />
                  ) : undefined
                }
              />
              <View className="gap-px bg-border">
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    today={today}
                    subtaskProgress={progress.get(task.id)}
                    onToggle={toggle}
                    onSnooze={snooze}
                  />
                ))}
              </View>
            </View>
          ))
        )}

        {!isLoading && view.followUps.length > 0 ? (
          <View>
            <SectionHeader title="Needs follow-up" />
            <View className="gap-px bg-border">
              {view.followUps.map(({ client, daysSilent }) => (
                <ListRow
                  key={client.id}
                  title={client.name}
                  subtitle={`No contact in ${daysSilent} days`}
                  onPress={() => router.push(`/clients/${client.id}`)}
                  left={<ClientAvatar name={client.name} color={client.color} />}
                  right={
                    <Button
                      label="Draft"
                      variant="ghost"
                      icon="mail"
                      accessibilityLabel={`Draft a follow-up to ${client.name}`}
                      onPress={() =>
                        router.push({
                          pathname: '/draft',
                          params: { kind: 'follow_up', clientId: client.id },
                        })
                      }
                    />
                  }
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
