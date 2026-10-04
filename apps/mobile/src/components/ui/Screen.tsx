import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';

/** Top-level tab screen chrome: large title header with optional trailing actions. */
export function Screen({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-end justify-between px-4 pb-2 pt-4">
        <View className="flex-1">
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
        </View>
        {right ? <View className="flex-row items-center">{right}</View> : null}
      </View>
      {children}
    </View>
  );
}
