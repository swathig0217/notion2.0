import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, Icon, ListSkeleton, Screen, Text } from '@/components/ui';
import { useDismissInboxItem, useInbox } from '@/features/capture/api';

function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function InboxScreen() {
  const inbox = useInbox();
  const dismiss = useDismissInboxItem();

  return (
    <Screen title="Inbox" subtitle="Everything you dump lands here">
      {inbox.isPending ? (
        <ListSkeleton rows={3} />
      ) : (
        <FlatList
          data={inbox.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="pb-40"
          ItemSeparatorComponent={() => <View className="h-px bg-border" />}
          ListEmptyComponent={
            <EmptyState
              icon="inbox"
              title="Inbox zero"
              body="Tap + to dump a thought, a pasted email or a to-do list. Soon, AI will turn each dump into a plan for you to approve."
              action={{ label: 'Dump something', onPress: () => router.push('/capture') }}
            />
          }
          renderItem={({ item }) => (
            <View className="flex-row items-start gap-3 bg-surface px-4 py-3">
              <View className="flex-1 gap-1">
                <Text numberOfLines={4}>{item.raw_content}</Text>
                <Text variant="caption">
                  {relativeTime(item.created_at)} · waiting for AI (coming soon)
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                hitSlop={10}
                onPress={() => dismiss(item)}
                className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-2"
              >
                <Icon name="x" size={18} />
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
