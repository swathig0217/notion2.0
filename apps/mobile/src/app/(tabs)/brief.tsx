import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { formatDueLabel } from '@notion2/shared';
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  ListSkeleton,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useWeeklyBrief } from '@/features/ai/brief';
import { AiError, aiErrorMessage } from '@/features/ai/api';
import { useTasks } from '@/features/tasks/api';
import { useTrack } from '@/lib/analytics';
import { toast } from '@/lib/toast';

function weekLabel(weekStart: string) {
  return `Week of ${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${weekStart}T00:00:00Z`))}`;
}

export default function BriefScreen() {
  const brief = useWeeklyBrief();
  const tasks = useTasks().data;
  const track = useTrack();
  const [refreshing, setRefreshing] = useState(false);
  const stored = brief.data;

  useEffect(() => {
    if (stored)
      track('weekly_brief_opened', {
        fallback: stored.fallback,
        priorities: stored.brief.priorities.length,
      });
    // Once per brief.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored?.week_start]);

  const taskState = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t.status])), [tasks]);

  const regenerate = async () => {
    setRefreshing(true);
    try {
      await brief.regenerate();
    } catch (e) {
      toast.error(aiErrorMessage(e instanceof AiError ? e.code : null));
    } finally {
      setRefreshing(false);
    }
  };

  if (brief.isPending) {
    return (
      <Screen title="Weekly Brief">
        <View accessibilityLabel="Preparing your brief" accessibilityLiveRegion="polite">
          <ListSkeleton rows={6} />
        </View>
      </Screen>
    );
  }
  if (!stored) {
    return (
      <Screen title="Weekly Brief">
        <EmptyState
          icon="file-text"
          title="Couldn’t prepare your brief"
          body={aiErrorMessage(brief.error instanceof AiError ? brief.error.code : null)}
          action={{ label: 'Try again', onPress: () => void brief.refetch() }}
        />
      </Screen>
    );
  }

  const { data, brief: b } = stored;
  const candidates = new Map(data.candidates.map((c) => [c.id, c]));

  return (
    <Screen
      title="Weekly Brief"
      subtitle={weekLabel(stored.week_start)}
      right={<IconButton icon="refresh-cw" label="Refresh brief" onPress={regenerate} />}
    >
      <ScrollView
        contentContainerClassName="pb-40"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={regenerate} />}
      >
        <View className="mx-4 mt-2 gap-2 rounded-card bg-accent-soft p-4">
          <Text testID="brief-headline" className="text-[17px] leading-[24px]">
            {b.headline}
          </Text>
          <Text variant="caption" className="text-text">
            {data.overdue.length} overdue · {data.due_this_week.length} due this week ·{' '}
            {data.completed_last_7_days} done last 7 days
          </Text>
        </View>

        <SectionHeader title="Top priorities" />
        {b.priorities.length === 0 ? (
          <Text variant="caption" className="px-4">
            Nothing pressing. A good week to get ahead.
          </Text>
        ) : (
          <View className="gap-px bg-border">
            {b.priorities.map((p, i) => {
              const t = candidates.get(p.task_id);
              if (!t) return null;
              const done = taskState.get(p.task_id) === 'done';
              const exists = taskState.has(p.task_id);
              return (
                <Pressable
                  key={p.task_id}
                  testID={`brief-priority-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}. ${t.title}. ${p.why}${done ? '. Done' : ''}`}
                  disabled={!exists}
                  onPress={() => router.push(`/tasks/${p.task_id}`)}
                  className="min-h-[60px] flex-row items-center gap-3 bg-surface px-4 py-3 active:bg-surface-2"
                >
                  <View
                    className={`h-7 w-7 items-center justify-center rounded-full ${done ? 'bg-success' : 'bg-accent'}`}
                  >
                    {done ? (
                      <Icon name="check" size={14} color="on-accent" />
                    ) : (
                      <Text className="font-semibold text-on-accent">{i + 1}</Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text numberOfLines={2} className={done ? 'text-faint line-through' : ''}>
                      {t.title}
                    </Text>
                    <Text variant="caption" numberOfLines={1}>
                      {[p.why, t.client, t.due_date ? formatDueLabel(t.due_date, data.today) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  {exists ? <Icon name="chevron-right" size={18} color="faint" /> : null}
                </Pressable>
              );
            })}
          </View>
        )}

        {b.follow_ups.length > 0 ? (
          <>
            <SectionHeader title="Check in with" />
            <View className="gap-px bg-border">
              {b.follow_ups.map((f) => {
                const c = data.silent_clients.find((s) => s.client_id === f.client_id);
                if (!c) return null;
                return (
                  <View
                    key={f.client_id}
                    className="min-h-[56px] flex-row items-center gap-3 bg-surface px-4 py-2"
                  >
                    <View className="flex-1">
                      <Text>{c.name}</Text>
                      <Text variant="caption">{f.why}</Text>
                    </View>
                    <Button
                      label="Draft follow-up"
                      variant="ghost"
                      icon="mail"
                      onPress={() =>
                        router.push({
                          pathname: '/draft',
                          params: { kind: 'follow_up', clientId: f.client_id },
                        })
                      }
                    />
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {data.stale.length > 0 ? (
          <>
            <SectionHeader title="Gone quiet" />
            <View className="gap-px bg-border">
              {data.stale.slice(0, 5).map((t) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.title}, hasn’t moved in a while`}
                  onPress={() => router.push(`/tasks/${t.id}`)}
                  className="min-h-[48px] justify-center bg-surface px-4 py-2 active:bg-surface-2"
                >
                  <Text numberOfLines={1}>{t.title}</Text>
                  <Text variant="caption">
                    {t.status === 'doing' ? 'In progress, no updates' : 'Waiting without a date'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {stored.fallback ? (
          <Text variant="caption" className="px-4 pt-4">
            Ranked automatically by due date and priority (the assistant wasn’t available).
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
