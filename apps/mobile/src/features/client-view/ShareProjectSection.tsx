import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, ListRow, SectionHeader } from '@/components/ui';
import { useCreateShareLink, useShareLink } from './api';

export function viewedLabel(count: number, last: string | null): string {
  if (count === 0 || !last) return 'Not opened yet';
  const when = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(last),
  );
  return `Opened ${count} ${count === 1 ? 'time' : 'times'}, last ${when}`;
}

/** Project page: create or open the read-only client link. */
export function ShareProjectSection({ projectId }: { projectId: string }) {
  const link = useShareLink(projectId).data;
  const create = useCreateShareLink();
  return (
    <>
      <SectionHeader title="Client view" />
      {link ? (
        <View className="gap-px bg-border">
          <ListRow
            title="Client link is on"
            subtitle={viewedLabel(link.view_count, link.last_viewed_at)}
            accessibilityLabel="Client link is on. Open sharing options"
            onPress={() => router.push(`/share/${projectId}`)}
          />
        </View>
      ) : (
        <View className="flex-row px-4">
          <Button
            testID="share-with-client"
            label="Share with client"
            icon="link"
            variant="secondary"
            onPress={() => {
              if (create(projectId)) router.push(`/share/${projectId}`);
            }}
          />
        </View>
      )}
    </>
  );
}
