import { Pressable, View } from 'react-native';
import { Icon, Text } from '@/components/ui';
import type { PasteOffer } from './types';

/** The one-tap "Turn into checklist (N items)" offer shown after a list paste. */
export function PasteOfferBar({
  offer,
  onAccept,
  onDismiss,
}: {
  offer: PasteOffer;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const label = `Turn into checklist (${offer.count} items)`;
  return (
    <View className="flex-row items-center gap-2 px-4 py-2" accessibilityLiveRegion="polite">
      <Pressable
        testID="smart-paste-offer"
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onAccept}
        className="flex-row items-center gap-2 rounded-full bg-accent px-4 py-2 active:opacity-80"
      >
        <Icon name="check-square" size={16} color="on-accent" />
        <Text className="font-semibold text-on-accent">{label}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Keep as pasted"
        hitSlop={10}
        onPress={onDismiss}
        className="h-9 w-9 items-center justify-center rounded-full bg-surface-2"
      >
        <Icon name="x" size={16} />
      </Pressable>
    </View>
  );
}
