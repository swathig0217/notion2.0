import { useMemo } from 'react';
import { SectionList, View } from 'react-native';
import { router } from 'expo-router';
import {
  EmptyState,
  IconButton,
  ListRow,
  ListSkeleton,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { useClients, type Client } from '@/features/clients/api';
import { ClientAvatar } from '@/features/clients/ClientAvatar';
import { useTasks } from '@/features/tasks/api';

const STATUS_ORDER = ['active', 'paused', 'archived'] as const;
const STATUS_TITLE = { active: 'Active', paused: 'Paused', archived: 'Archived' };

export default function ClientsScreen() {
  const clients = useClients();
  const tasks = useTasks();

  const openCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks.data ?? []) {
      if (t.client_id && t.status !== 'done' && !t.parent_task_id)
        m.set(t.client_id, (m.get(t.client_id) ?? 0) + 1);
    }
    return m;
  }, [tasks.data]);

  const sections = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        title: STATUS_TITLE[status],
        data: (clients.data ?? []).filter((c) => c.status === status),
      })).filter((s) => s.data.length > 0),
    [clients.data],
  );

  return (
    <Screen
      title="Clients"
      right={
        <IconButton
          icon="user-plus"
          label="New client"
          color="accent"
          onPress={() => router.push('/clients/new')}
        />
      }
    >
      {clients.isPending ? (
        <ListSkeleton rows={4} />
      ) : (
        <SectionList<Client>
          sections={sections}
          keyExtractor={(c) => c.id}
          contentContainerClassName="pb-40"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
          ItemSeparatorComponent={() => <View className="h-px bg-border" />}
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title="No clients yet"
              body="Add the people you work for. Tasks, projects and notes hang off them."
              action={{ label: 'Add a client', onPress: () => router.push('/clients/new') }}
            />
          }
          renderItem={({ item }) => {
            const open = openCounts.get(item.id) ?? 0;
            return (
              <ListRow
                title={item.name}
                subtitle={open ? `${open} open task${open === 1 ? '' : 's'}` : 'No open tasks'}
                left={<ClientAvatar name={item.name} color={item.color} />}
                onPress={() => router.push(`/clients/${item.id}`)}
              />
            );
          }}
        />
      )}
    </Screen>
  );
}
