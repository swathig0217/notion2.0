import { Pressable } from 'react-native';
import { Icon } from './Icon';

export function Checkbox({
  checked,
  onToggle,
  label,
  size = 24,
}: {
  checked: boolean;
  onToggle: () => void;
  /** What is being checked, for screen readers (e.g. the task title). */
  label: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      aria-checked={checked}
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onToggle}
      style={{ width: size, height: size }}
      className={`items-center justify-center rounded-full border-2 ${checked ? 'border-accent bg-accent' : 'border-faint'}`}
    >
      {checked ? <Icon name="check" size={size * 0.6} color="on-accent" /> : null}
    </Pressable>
  );
}
