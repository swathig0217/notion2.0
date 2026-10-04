import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export function Skeleton({ className = '' }: { className?: string }) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style} className={`rounded-lg bg-surface-2 ${className}`} />;
}

/** Placeholder rows shaped like task rows. No spinners on primary flows. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View className="gap-3 px-4 py-2" accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className="flex-row items-center gap-3">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className={`h-4 ${i % 2 ? 'w-2/3' : 'w-1/2'}`} />
        </View>
      ))}
    </View>
  );
}
