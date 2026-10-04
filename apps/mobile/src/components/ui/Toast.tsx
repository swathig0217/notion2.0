import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast, toastStore } from '@/lib/toast';
import { Text } from './Text';

export function ToastHost() {
  const current = toastStore.use();
  const insets = useSafeAreaInsets();
  if (!current) return null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0"
      style={{ bottom: insets.bottom + 96 }}
    >
      <Animated.View
        key={current.id}
        entering={FadeInDown.duration(160)}
        exiting={FadeOutDown.duration(120)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        className={`mx-4 flex-row items-center gap-3 rounded-2xl px-4 py-3 shadow-lg ${current.tone === 'error' ? 'bg-danger' : 'bg-text'}`}
      >
        <Text className="flex-1 text-bg">{current.message}</Text>
        {current.action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={current.action.label}
            hitSlop={10}
            onPress={() => {
              current.action?.onPress();
              toast.dismiss();
            }}
          >
            <Text className="font-semibold text-accent-soft">{current.action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
