import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface SwipeAction {
  label: string;
  icon: IconName;
  onTrigger: () => void;
}

function ActionPanel({
  action,
  tone,
  align,
}: {
  action: SwipeAction;
  tone: string;
  align: 'left' | 'right';
}) {
  return (
    <View
      className={`flex-1 flex-row items-center gap-2 px-6 ${tone} ${align === 'left' ? 'justify-start' : 'justify-end'}`}
    >
      <Icon name={action.icon} size={20} color="on-accent" />
      <Text className="font-semibold text-on-accent">{action.label}</Text>
    </View>
  );
}

/**
 * Swipe right to complete, swipe left for the secondary action (e.g. snooze).
 * Actions are also reachable without gestures (checkbox, detail screen) for accessibility.
 */
export function SwipeRow({
  children,
  right,
  left,
}: {
  children: ReactNode;
  /** Revealed by swiping right (leading edge). */
  right?: SwipeAction;
  /** Revealed by swiping left (trailing edge). */
  left?: SwipeAction;
}) {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.5}
      leftThreshold={72}
      rightThreshold={72}
      overshootFriction={8}
      renderLeftActions={
        right ? () => <ActionPanel action={right} tone="bg-success" align="left" /> : undefined
      }
      renderRightActions={
        left ? () => <ActionPanel action={left} tone="bg-warning" align="right" /> : undefined
      }
      onSwipeableOpen={(direction) => {
        // `RIGHT` means the row moved right, revealing the leading (left) actions.
        if (direction === SwipeDirection.RIGHT) right?.onTrigger();
        else left?.onTrigger();
        ref.current?.close();
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
