import { forwardRef, useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputProps } from 'react-native';
import {
  checklistOfferCount,
  diffInsertion,
  isMultilinePaste,
  parseChecklist,
  type ChecklistItem,
} from '@notion2/shared';
import { useColors } from '@/theme/useColors';
import { Icon, Text } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useAutoGrow } from './useAutoGrow';

export interface SmartPasteInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  /** Called when the user taps the offer. The pasted text is removed from the field. */
  onChecklist: (items: ChecklistItem[]) => void;
  offerLabel?: (count: number) => string;
  /** Let Enter insert newlines (notes) instead of submitting (titles, quick add). */
  allowNewlines?: boolean;
  className?: string;
}

interface Offer {
  pasted: string;
  restore: string;
  count: number;
}

/**
 * A text input that notices multi-line pastes and offers "Turn into checklist (N items)".
 * TextInput has no paste event, so a paste is detected as a multi-character insertion
 * containing a newline. Parsing is local: instant and offline.
 */
export const SmartPasteInput = forwardRef<TextInput, SmartPasteInputProps>(function SmartPasteInput(
  { value, onChangeText, onChecklist, offerLabel, allowNewlines = false, className = '', ...props },
  ref,
) {
  const colors = useColors();
  const [offer, setOffer] = useState<Offer | null>(null);
  const autoGrow = useAutoGrow(allowNewlines ? 96 : 24);

  const handleChange = (next: string) => {
    // `value` is still the pre-edit text here, so the diff isolates what was pasted.
    const insertion = diffInsertion(value, next);
    if (isMultilinePaste(insertion)) {
      const count = checklistOfferCount(insertion.inserted);
      setOffer(
        count >= 2 ? { pasted: insertion.inserted, restore: insertion.without, count } : null,
      );
    } else if (offer) {
      setOffer(null); // any further edit dismisses the offer
    }
    onChangeText(next);
  };

  const label = offer
    ? offerLabel
      ? offerLabel(offer.count)
      : `Turn into checklist (${offer.count} items)`
    : '';

  return (
    <View>
      <TextInput
        ref={ref}
        multiline
        submitBehavior={allowNewlines ? 'newline' : 'submit'}
        value={value}
        onChangeText={handleChange}
        onKeyPress={
          Platform.OS === 'web' && !allowNewlines
            ? (e) => {
                // react-native-web ignores submitBehavior on multiline inputs.
                const ev = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                if (ev.key === 'Enter' && !ev.shiftKey) {
                  e.preventDefault();
                  props.onSubmitEditing?.(e as never);
                }
              }
            : props.onKeyPress
        }
        placeholderTextColor={colors.faint}
        maxFontSizeMultiplier={1.8}
        className={`text-[16px] text-text ${className}`}
        {...autoGrow}
        {...props}
      />
      {offer ? (
        <View className="mt-2 flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            testID="smart-paste-offer"
            onPress={() => {
              const { items } = parseChecklist(offer.pasted);
              haptics.success();
              setOffer(null);
              onChangeText(offer.restore);
              onChecklist(items);
            }}
            className="flex-row items-center gap-2 rounded-full bg-accent px-4 py-2 active:opacity-80"
          >
            <Icon name="check-square" size={16} color="on-accent" />
            <Text className="font-semibold text-on-accent">{label}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep as text"
            hitSlop={10}
            onPress={() => setOffer(null)}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface-2"
          >
            <Icon name="x" size={16} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});
