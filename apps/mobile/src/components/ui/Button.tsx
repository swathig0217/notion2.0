import { Pressable, type PressableProps } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-accent',
  secondary: 'bg-surface-2',
  ghost: 'bg-transparent',
  danger: 'bg-surface-2',
};
const LABEL: Record<Variant, string> = {
  primary: 'text-on-accent',
  secondary: 'text-text',
  ghost: 'text-accent',
  danger: 'text-danger',
};

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  icon?: IconName;
  className?: string;
}

export function Button({
  label,
  variant = 'primary',
  icon,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={!!disabled}
      disabled={disabled}
      className={`min-h-[48px] flex-row items-center justify-center gap-2 rounded-xl px-5 active:opacity-70 ${CONTAINER[variant]} ${disabled ? 'opacity-40' : ''} ${className}`}
      {...props}
    >
      {icon ? (
        <Icon
          name={icon}
          size={18}
          color={variant === 'primary' ? 'on-accent' : variant === 'danger' ? 'danger' : 'accent'}
        />
      ) : null}
      <Text className={`font-semibold ${LABEL[variant]}`}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  color = 'muted',
  ...props
}: Omit<PressableProps, 'children'> & {
  icon: IconName;
  label: string;
  color?: 'muted' | 'accent' | 'text' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-2"
      {...props}
    >
      <Icon name={icon} size={22} color={color} />
    </Pressable>
  );
}
