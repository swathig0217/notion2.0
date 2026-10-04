import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui';

/** Large, thumb-friendly choice chips. Single or multi select. */
export function OptionChips({
  options,
  selected,
  onToggle,
  label,
  multi = false,
}: {
  options: readonly string[];
  selected: readonly string[];
  onToggle: (option: string) => void;
  label: string;
  multi?: boolean;
}) {
  return (
    <View
      accessibilityRole={multi ? undefined : 'radiogroup'}
      accessibilityLabel={label}
      className="flex-row flex-wrap gap-2"
    >
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            accessibilityLabel={option}
            onPress={() => onToggle(option)}
            className={`min-h-[44px] justify-center rounded-full border px-4 ${on ? 'border-accent bg-accent' : 'border-border bg-surface'}`}
          >
            <Text className={on ? 'font-semibold text-on-accent' : 'text-text'}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
