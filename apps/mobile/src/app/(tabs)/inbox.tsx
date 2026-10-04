import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  EmptyState,
  Icon,
  ListSkeleton,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
} from '@/components/ui';
import { useDismissInboxItem, useInbox, type InboxItem } from '@/features/capture/api';
import {
  aiErrorMessage,
  parseProposal,
  useAiActions,
  useProcessErrors,
  useProcessInbox,
  useProcessingIds,
  type AiAction,
} from '@/features/ai/api';
import { useUndoFlow } from '@/features/ai/useUndoFlow';

function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const KIND_ICON = { text: 'type', voice: 'mic', email: 'mail', image: 'image' } as const;

function InboxRow({
  item,
  action,
  processing,
  errorCode,
  onOrganize,
  onDismiss,
}: {
  item: InboxItem;
  action: AiAction | undefined;
  processing: boolean;
  errorCode: string | undefined;
  onOrganize: () => void;
  onDismiss: () => void;
}) {
  const proposal = action?.status === 'proposed' ? parseProposal(action) : null;
  return (
    <View testID={`inbox-item-${item.id}`} className="gap-2 bg-surface px-4 py-3">
      <View className="flex-row items-start gap-3">
        <View className="pt-0.5">
          <Icon name={KIND_ICON[item.kind]} size={16} color="faint" />
        </View>
        <View className="flex-1 gap-1">
          <Text numberOfLines={4}>{item.raw_content}</Text>
          <Text variant="caption">{relativeTime(item.created_at)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={10}
          onPress={onDismiss}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-2"
        >
          <Icon name="x" size={18} />
        </Pressable>
      </View>

      {processing ? (
        <View
          className="ml-7 gap-2"
          accessibilityLabel="Organizing"
          accessibilityLiveRegion="polite"
        >
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </View>
      ) : proposal ? (
        <Pressable
          testID="review-proposal"
          accessibilityRole="button"
          accessibilityLabel={proposal.questions.length ? 'Answer the question' : 'Review proposal'}
          onPress={() => action && router.push(`/review/${action.id}`)}
          className="ml-7 flex-row items-center gap-2 rounded-xl bg-accent-soft px-3 py-2.5 active:opacity-80"
        >
          <Icon name={proposal.questions.length ? 'help-circle' : 'zap'} size={16} color="accent" />
          <Text className="flex-1 text-accent" numberOfLines={2}>
            {proposal.questions[0] ?? proposal.summary}
          </Text>
          <Icon name="chevron-right" size={16} color="accent" />
        </Pressable>
      ) : (
        <View className="ml-7 gap-2">
          {errorCode ? (
            <Text variant="caption" className="text-danger" accessibilityLiveRegion="polite">
              {aiErrorMessage(errorCode)}
            </Text>
          ) : null}
          <View className="flex-row">
            <Button
              testID="organize"
              label={errorCode ? 'Try again' : 'Organize'}
              icon="zap"
              variant="secondary"
              onPress={onOrganize}
            />
          </View>
        </View>
      )}
    </View>
  );
}

export default function InboxScreen() {
  const inbox = useInbox();
  const actions = useAiActions();
  const dismiss = useDismissInboxItem();
  const process = useProcessInbox();
  const processing = useProcessingIds();
  const errors = useProcessErrors();
  const undo = useUndoFlow();

  // The latest action for each inbox item decides what the row offers.
  const latestByItem = useMemo(() => {
    const map = new Map<string, AiAction>();
    for (const a of actions.data ?? []) {
      if (a.inbox_item_id && !map.has(a.inbox_item_id)) map.set(a.inbox_item_id, a);
    }
    return map;
  }, [actions.data]);

  const recentApplied = (actions.data ?? [])
    .filter((a) => a.status === 'accepted' || a.status === 'edited')
    .slice(0, 10);
  const items = inbox.data ?? [];

  return (
    <Screen title="Inbox" subtitle="Dump anything. The assistant proposes, you approve.">
      {inbox.isPending ? (
        <ListSkeleton rows={3} />
      ) : (
        <ScrollView contentContainerClassName="pb-40">
          {items.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="Inbox zero"
              body="Tap + to dump a thought, a client email or a to-do list. The assistant turns it into tasks for you to approve."
              action={{ label: 'Dump something', onPress: () => router.push('/capture') }}
            />
          ) : (
            <View className="mt-2 gap-px bg-border">
              {items.map((item) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  action={latestByItem.get(item.id)}
                  processing={processing.has(item.id)}
                  errorCode={errors.get(item.id)}
                  onOrganize={() => process.mutate({ inboxItemId: item.id })}
                  onDismiss={() => dismiss(item)}
                />
              ))}
            </View>
          )}

          {recentApplied.length > 0 ? (
            <>
              <SectionHeader title="Recent AI changes" />
              <View className="gap-px bg-border">
                {recentApplied.map((a) => (
                  <View key={a.id} className="flex-row items-center gap-3 bg-surface px-4 py-3">
                    <Icon name="check" size={16} color="success" />
                    <View className="flex-1">
                      <Text numberOfLines={2}>{parseProposal(a)?.summary ?? 'AI changes'}</Text>
                      <Text variant="caption">{relativeTime(a.updated_at)}</Text>
                    </View>
                    <Button
                      testID={`undo-${a.id}`}
                      label="Undo"
                      variant="ghost"
                      onPress={() => void undo(a)}
                    />
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
