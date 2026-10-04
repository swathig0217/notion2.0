import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, Skeleton, Text } from '@/components/ui';
import { ClientViewCard } from '@/features/client-view/ClientViewCard';
import { ClientViewError, usePublicClientView } from '@/features/client-view/api';
import { APP_NAME } from '@/lib/brand';

/** Public, read-only project page a freelancer shares with their client. No login. */
export default function PublicClientView() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const view = usePublicClientView(token);
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen options={{ title: view.data?.project.title ?? APP_NAME }} />
      <ScrollView
        className="flex-1 bg-bg"
        contentContainerClassName="mx-auto w-full max-w-[640px] gap-8 px-4"
        contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }}
      >
        {view.isPending ? (
          <View className="gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-40 w-full" />
          </View>
        ) : view.data ? (
          <ClientViewCard view={view.data} />
        ) : (
          <EmptyState
            icon="link"
            title={
              view.error instanceof ClientViewError && view.error.code === 'not_found'
                ? 'This link isn’t active'
                : 'Couldn’t load this project'
            }
            body={
              view.error instanceof ClientViewError && view.error.code === 'not_found'
                ? 'Ask for a new link if you still need access.'
                : 'Check your connection and try again.'
            }
          />
        )}
        <Text variant="caption" className="text-center">
          Shared with you from {APP_NAME}. Read-only.
        </Text>
      </ScrollView>
    </>
  );
}
