import { View } from 'react-native';
import { Text } from '@/components/ui';
import { useColors } from '@/theme/useColors';

export function ClientAvatar({
  name,
  color,
  size = 32,
}: {
  name: string;
  color: string | null;
  size?: number;
}) {
  const colors = useColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: color ?? colors.faint }}
    >
      <Text className="font-semibold" style={{ color: colors['on-accent'], fontSize: size * 0.42 }}>
        {name.trim().slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}
