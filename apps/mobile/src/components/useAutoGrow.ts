import { useState } from 'react';
import {
  Platform,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
} from 'react-native';

/**
 * react-native-web renders multiline inputs as a fixed 2-row textarea. This makes them
 * start at one row and grow with content, like native. No-op on iOS/Android.
 */
export function useAutoGrow(minHeight: number) {
  const [height, setHeight] = useState(minHeight);
  if (Platform.OS !== 'web') return {};
  return {
    rows: 1,
    style: { height: Math.max(minHeight, height) },
    onContentSizeChange: (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) =>
      setHeight(e.nativeEvent.contentSize.height),
  };
}
