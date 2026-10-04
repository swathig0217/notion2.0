import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      className="min-h-[56px] flex-row items-center gap-3 bg-surface px-4 py-3 active:bg-surface-2"
    >
      {left}
      <View className="flex-1">
        <Text numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={18} color="faint" /> : null)}
    </Pressable>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between px-4 pb-2 pt-6">
      <Text variant="label" accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}
