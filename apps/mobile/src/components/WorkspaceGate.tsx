import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ListSkeleton, Text } from '@/components/ui';
import { useMe } from '@/features/auth/useMe';

/** First launch only: the workspace must load once before anything can be created. */
export function WorkspaceGate() {
  const me = useMe();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 24 }}>
      {me.isError ? (
        <View className="items-center gap-3 px-6 pt-12">
          <Text variant="heading">Couldn’t load your workspace</Text>
          <Text variant="caption" className="text-center">
            Check your connection and try again.
          </Text>
          <Button label="Try again" variant="secondary" onPress={() => void me.refetch()} />
        </View>
      ) : (
        <ListSkeleton rows={6} />
      )}
    </View>
  );
}
