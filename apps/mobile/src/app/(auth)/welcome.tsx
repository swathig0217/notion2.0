import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, Text } from '@/components/ui';

const POINTS = [
  { icon: 'zap', text: 'Ready in minutes. No templates to build.' },
  { icon: 'clipboard', text: 'Paste a messy list, get a clean checklist.' },
  { icon: 'sun', text: 'One calm view of what needs you today.' },
] as const;

export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 justify-between bg-bg px-6"
      style={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }}
    >
      <View className="gap-4">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-accent">
          <Icon name="check" size={26} color="on-accent" />
        </View>
        <Text variant="title" accessibilityRole="header">
          Your clients, projects and to-dos. Organized for you.
        </Text>
        <Text className="text-muted">A calm workspace for freelancers and small studios.</Text>
        <View className="mt-6 gap-4">
          {POINTS.map((p) => (
            <View key={p.text} className="flex-row items-center gap-3">
              <Icon name={p.icon} size={18} color="accent" />
              <Text className="flex-1">{p.text}</Text>
            </View>
          ))}
        </View>
      </View>
      <Button label="Get started" onPress={() => router.push('/sign-in')} />
    </View>
  );
}
