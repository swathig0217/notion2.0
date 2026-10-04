import { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { useColors } from '@/theme/useColors';
import { useAutoGrow } from './useAutoGrow';

/** Large editable title that saves on blur/submit. Empty edits revert. */
export function InlineTitle({
  value,
  onSave,
  placeholder,
  testID,
}: {
  value: string;
  onSave: (next: string) => void;
  placeholder: string;
  testID?: string;
}) {
  const colors = useColors();
  const [draft, setDraft] = useState(value);
  const autoGrow = useAutoGrow(32);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (!next) setDraft(value);
    else if (next !== value) onSave(next);
  };
  return (
    <TextInput
      testID={testID}
      value={draft}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      placeholder={placeholder}
      placeholderTextColor={colors.faint}
      accessibilityLabel={placeholder}
      returnKeyType="done"
      multiline
      submitBehavior="blurAndSubmit"
      maxFontSizeMultiplier={1.6}
      className="text-[26px] font-bold leading-[32px] text-text"
      {...autoGrow}
    />
  );
}
