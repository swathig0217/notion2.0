import { Pressable, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui';
import { useColors } from '@/theme/useColors';
import { useSyncTimeZone } from '@/features/auth/useSyncTimeZone';
import { useMe } from '@/features/auth/useMe';
import { Button, ListSkeleton, Text } from '@/components/ui';

const TAB_ICONS: Record<string, IconName> = {
  index: 'sun',
  inbox: 'inbox',
  clients: 'users',
  brief: 'file-text',
};

/** Floating "Dump it" capture button, reachable with one thumb from every tab. */
function CaptureButton() {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="absolute right-5"
      style={{ bottom: insets.bottom + 68 }}
    >
      <Pressable
        testID="capture-button"
        accessibilityRole="button"
        accessibilityLabel="Dump it: capture anything"
        onPress={() => router.push('/capture')}
        className="h-14 w-14 items-center justify-center rounded-full bg-accent shadow-lg active:opacity-80"
      >
        <Icon name="plus" size={28} color="on-accent" />
      </Pressable>
    </View>
  );
}

/** First launch only: the workspace must load once before anything can be created. */
function WorkspaceGate() {
  const me = useMe();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top + 24 }}>
      {me.isError ? (
        <View className="items-center gap-3 px-6 pt-12">
          <Text variant="heading">Couldn’t load your workspace</Text>
          <Text variant="caption" className="text-center">
            Check your connection and try again.
          </Text>
          <Button label="Try again" variant="secondary" onPress={() => void me.refetch()} />
        </View>
      ) : (
        <ListSkeleton rows={6} />
      )}
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  const me = useMe();
  useSyncTimeZone();
  if (!me.data) return <WorkspaceGate />;
  return (
    <View className="flex-1">
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.faint,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          sceneStyle: { backgroundColor: colors.bg },
          tabBarIcon: ({ color, size }) => (
            <Icon
              name={TAB_ICONS[route.name] ?? 'circle'}
              size={size - 2}
              color={color === colors.accent ? 'accent' : 'faint'}
            />
          ),
        })}
      >
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="inbox" options={{ title: 'Inbox' }} />
        <Tabs.Screen name="clients" options={{ title: 'Clients' }} />
        <Tabs.Screen name="brief" options={{ title: 'Brief' }} />
      </Tabs>
      <CaptureButton />
    </View>
  );
}
