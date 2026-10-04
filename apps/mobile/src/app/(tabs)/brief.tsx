import { View } from 'react-native';
import { EmptyState, Screen } from '@/components/ui';

export default function BriefScreen() {
  return (
    <Screen title="Weekly Brief">
      <View className="flex-1 justify-center">
        <EmptyState
          icon="file-text"
          title="Your first brief arrives Monday"
          body="Every week: what's overdue, which clients need a nudge, and your top 5 priorities, each with a one-tap action."
        />
      </View>
    </Screen>
  );
}
