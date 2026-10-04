import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useColors } from '@/theme/useColors';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  className?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, className = '', ...props },
  ref,
) {
  const colors = useColors();
  return (
    <View className="gap-1.5">
      {label ? <Text variant="caption">{label}</Text> : null}
      <TextInput
        ref={ref}
        accessibilityLabel={props.accessibilityLabel ?? label ?? props.placeholder}
        placeholderTextColor={colors.faint}
        maxFontSizeMultiplier={1.8}
        className={`min-h-[48px] rounded-xl border bg-surface px-4 py-3 text-[16px] text-text ${error ? 'border-danger' : 'border-border'} ${className}`}
        {...props}
      />
      {error ? (
        <Text variant="caption" className="text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});
