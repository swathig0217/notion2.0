import '../../global.css';
import '@/theme/interop';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { persister, queryClient } from '@/lib/query-client';
import { initSentry, reportError } from '@/lib/sentry';
import '@/features/ai/setup';
import { ThemeRoot } from '@/theme/ThemeRoot';
import { useColors } from '@/theme/useColors';
import { Text, ToastHost } from '@/components/ui';
import { SessionProvider, useSession } from '@/features/auth/session';
import { useMe } from '@/features/auth/useMe';
import { WorkspaceGate } from '@/components/WorkspaceGate';
import { useShareIntake } from '@/features/share/useShareIntake';

initSentry();

function RootStack() {
  const { session, loading } = useSession();
  const me = useMe();
  if (loading) return null; // splash stays up; session is read from local storage
  const signedIn = session != null;
  // Signed in: the profile decides between onboarding and the app (cached after first load).
  if (signedIn && !me.data) return <WorkspaceGate />;
  const onboarded = me.data?.profile.onboarded_at != null;
  return <AppStack signedIn={signedIn} onboarded={onboarded} />;
}

function AppStack({ signedIn, onboarded }: { signedIn: boolean; onboarded: boolean }) {
  const colors = useColors();
  useShareIntake(signedIn && onboarded);
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
        <Stack.Screen name="draft" options={{ presentation: 'modal', title: 'Draft' }} />
        <Stack.Screen name="upgrade" options={{ presentation: 'modal', title: '' }} />
        <Stack.Screen name="invoices/new" options={{ presentation: 'modal', title: 'Invoice' }} />
        <Stack.Screen name="invoices/[id]" options={{ title: '' }} />
        <Stack.Screen name="share/[projectId]" options={{ title: 'Client view' }} />
      </Stack.Protected>
      {/* Public, signed in or not: a client's read-only project view. */}
      <Stack.Screen name="p/[token]" options={{ headerShown: false }} />
      {/* Last, so guard redirects never land here. */}
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
    </Stack>
  );
}

/**
 * Last line of defense for render errors on any route: report (no user content) and
 * offer a retry instead of a white screen. Data is safe in the cache and the server.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError(error, { boundary: 'route' }), [error]);
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-bg p-8">
      <Text variant="heading" className="text-center">
        Something went wrong on this screen
      </Text>
      <Text variant="caption" className="text-center">
        Your work is saved. Try again, and if it keeps happening, restart the app.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        onPress={() => void retry()}
        className="min-h-[44px] justify-center rounded-xl bg-accent px-6"
      >
        <Text className="font-semibold text-on-accent">Try again</Text>
      </Pressable>
    </View>
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
            dehydrateOptions: {
              shouldDehydrateMutation: (m) => m.state.isPaused,
              shouldDehydrateQuery: (q) =>
                q.state.status === 'success' && q.meta?.persist !== false,
            },
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
