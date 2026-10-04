import { Pressable, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui';
import { useColors } from '@/theme/useColors';
import { useSyncTimeZone } from '@/features/auth/useSyncTimeZone';
import { TimerBar } from '@/features/time/TimerBar';
import { useRunningEntry } from '@/features/time/api';
import { useNotificationSetup } from '@/features/notifications/usePushRegistration';

const TAB_ICONS: Record<string, IconName> = {
  index: 'sun',
  inbox: 'inbox',
  clients: 'users',
  brief: 'file-text',
};

/** Floating "Dump it" capture button, reachable with one thumb from every tab. */
function CaptureButton() {
  const insets = useSafeAreaInsets();
  // Lift the button above the timer bar while a timer runs.
  const timerRunning = useRunningEntry() != null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute right-5"
      style={{ bottom: insets.bottom + (timerRunning ? 116 : 68) }}
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

/** The running-timer bar sits just above the tab bar. */
function TimerOverlay() {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0"
      style={{ bottom: insets.bottom + 49 }}
    >
      <TimerBar />
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  useSyncTimeZone();
  useNotificationSetup();
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
      <TimerOverlay />
      <CaptureButton />
    </View>
  );
}
