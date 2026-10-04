import '../../global.css';
import '@/theme/interop';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { persister, queryClient } from '@/lib/query-client';
import { initSentry } from '@/lib/sentry';
import '@/features/ai/setup';
import { ThemeRoot } from '@/theme/ThemeRoot';
import { useColors } from '@/theme/useColors';
import { ToastHost } from '@/components/ui';
import { SessionProvider, useSession } from '@/features/auth/session';
import { useMe } from '@/features/auth/useMe';
import { WorkspaceGate } from '@/components/WorkspaceGate';

initSentry();

function RootStack() {
  const { session, loading } = useSession();
  const colors = useColors();
  const me = useMe();
  if (loading) return null; // splash stays up; session is read from local storage
  const signedIn = session != null;
  // Signed in: the profile decides between onboarding and the app (cached after first load).
  if (signedIn && !me.data) return <WorkspaceGate />;
  const onboarded = me.data?.profile.onboarded_at != null;
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
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded}>
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
        <Stack.Screen
          name="review/[id]"
          options={{ presentation: 'modal', title: 'Review proposal' }}
        />
      </Stack.Protected>
      {/* Last, so guard redirects never land here. */}
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
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
