import { Pressable } from 'react-native';
import { Icon, Text, type IconName } from '@/components/ui';

export function ToolbarButton({
  label,
  icon,
  text,
  active = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: IconName;
  text?: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-selected={active}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      // Keep focus (and the selection) in the editor on web.
      onPointerDown={(e) => e.preventDefault()}
      className={`h-10 min-w-[40px] items-center justify-center rounded-lg px-2 ${active ? 'bg-accent-soft' : ''} ${disabled ? 'opacity-30' : ''}`}
    >
      {icon ? (
        <Icon name={icon} size={18} color={active ? 'accent' : 'text'} />
      ) : (
        <Text className={`font-bold ${active ? 'text-accent' : 'text-text'}`}>{text}</Text>
      )}
    </Pressable>
  );
}
