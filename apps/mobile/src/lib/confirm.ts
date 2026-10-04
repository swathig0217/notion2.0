import { Alert, Platform } from 'react-native';

/** Destructive-action confirmation that works on native and web. */
export function confirmDestructive(
  title: string,
  message: string,
  onConfirm: () => void,
  action = 'Delete',
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}
