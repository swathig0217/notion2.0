import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui';

/** Small segmented control for enums (status, priority). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row rounded-xl bg-surface-2 p-1"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            aria-selected={selected}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            className={`min-h-[36px] flex-1 items-center justify-center rounded-lg px-2 ${selected ? 'bg-surface' : ''}`}
          >
            <Text variant="caption" className={selected ? 'font-semibold text-text' : ''}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
