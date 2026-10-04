import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { useColors } from '@/theme/useColors';
import type { ColorName } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({
  name,
  size = 20,
  color = 'muted',
}: {
  name: IconName;
  size?: number;
  color?: ColorName;
}) {
  const colors = useColors();
  return <Feather name={name} size={size} color={colors[color]} accessibilityElementsHidden />;
}
