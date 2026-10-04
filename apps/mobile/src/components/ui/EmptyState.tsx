import { View } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="items-center gap-3 px-8 py-12">
      <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
        <Icon name={icon} size={24} color="accent" />
      </View>
      <Text variant="heading" className="text-center">
        {title}
      </Text>
      {body ? (
        <Text variant="caption" className="text-center">
          {body}
        </Text>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="secondary"
          className="mt-2"
        />
      ) : null}
    </View>
  );
}
