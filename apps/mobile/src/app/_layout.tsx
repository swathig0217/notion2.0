import '../../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { persister, queryClient } from '@/lib/query-client';
import { initSentry } from '@/lib/sentry';
import { ThemeRoot } from '@/theme/ThemeRoot';
import { useColors } from '@/theme/useColors';
import { ToastHost } from '@/components/ui';
import { SessionProvider, useSession } from '@/features/auth/session';

initSentry();

function RootStack() {
  const { session, loading } = useSession();
  const colors = useColors();
  if (loading) return null; // splash stays up; session is read from local storage
  const signedIn = session != null;
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="clients/[id]" options={{ title: '' }} />
        <Stack.Screen name="clients/new" options={{ presentation: 'modal', title: 'New client' }} />
        <Stack.Screen name="projects/[id]" options={{ title: '' }} />
        <Stack.Screen
          name="projects/new"
          options={{ presentation: 'modal', title: 'New project' }}
        />
        <Stack.Screen name="tasks/[id]" options={{ title: '' }} />
        <Stack.Screen name="notes/[id]" options={{ title: '' }} />
        <Stack.Screen name="capture" options={{ presentation: 'modal', title: 'Dump it' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24 * 7,
            // Paused writes (made offline) are persisted and replayed on next launch.
            dehydrateOptions: { shouldDehydrateMutation: (m) => m.state.isPaused },
          }}
          // Writes queued while offline (or before an app restart) resume once the cache restores.
          onSuccess={() => void queryClient.resumePausedMutations()}
        >
          <SessionProvider>
            <ThemeRoot>
              <StatusBar style="auto" />
              <RootStack />
              <ToastHost />
            </ThemeRoot>
          </SessionProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
