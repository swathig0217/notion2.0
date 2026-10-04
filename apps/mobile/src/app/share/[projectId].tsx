import { useMemo } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { buildClientView, visibleTasks } from '@notion2/shared';
import { Button, Checkbox, EmptyState, ListSkeleton, SectionHeader, Text } from '@/components/ui';
import { useMe } from '@/features/auth/useMe';
import { useClient } from '@/features/clients/api';
import { ClientViewCard } from '@/features/client-view/ClientViewCard';
import { viewedLabel } from '@/features/client-view/ShareProjectSection';
import {
  linkUrl,
  useRevokeShareLink,
  useSetTaskHidden,
  useShareLink,
} from '@/features/client-view/api';
import { useProject } from '@/features/projects/api';
import { useTasks } from '@/features/tasks/api';
import { useTrack } from '@/lib/analytics';
import { confirmDestructive } from '@/lib/confirm';
import { toast } from '@/lib/toast';

/** Sharing options for a project's client link, with a live preview of what they see. */
export default function ShareProject() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { data: project, isPending } = useProject(projectId);
  const { data: link, isPending: linkPending } = useShareLink(projectId);
  const client = useClient(project?.client_id ?? undefined).data;
  const tasks = useTasks().data;
  const me = useMe().data;
  const setHidden = useSetTaskHidden();
  const revoke = useRevokeShareLink();
  const track = useTrack();

  const projectTasks = useMemo(
    () => (tasks ?? []).filter((t) => t.project_id === projectId),
    [tasks, projectId],
  );

  if (isPending || linkPending) return <ListSkeleton />;
  if (!project || !link) {
    return (
      <EmptyState
        icon="link"
        title="No client link"
        action={{ label: 'Back', onPress: () => router.back() }}
      />
    );
  }

  const url = linkUrl(link.token);
  const preview = buildClientView({
    project,
    clientName: client?.name ?? null,
    from: me?.profile.display_name ?? me?.workspace.name ?? null,
    tasks: projectTasks,
    hiddenTaskIds: link.hidden_task_ids,
  });
  // Every task the client could see if not hidden (top-level, recent done work).
  const candidates = visibleTasks(projectTasks, [], new Date());
  const hidden = new Set(link.hidden_task_ids);

  const share = async () => {
    if (!url) return;
    try {
      await Share.share({ message: `Here’s where ${project.title} stands: ${url}` });
      track('client_link_shared');
    } catch {
      toast.error('Couldn’t open the share sheet.');
    }
  };

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="pb-24">
      <View className="gap-3 px-4 pt-3">
        <Text variant="caption">
          Anyone with this link can see the project’s status and the tasks below. Never your notes,
          time, invoices or other projects.
        </Text>
        {url ? (
          <Text testID="share-url" selectable className="font-semibold">
            {url}
          </Text>
        ) : (
          <Text variant="caption" className="text-danger">
            Set EXPO_PUBLIC_APP_URL to share links from the app.
          </Text>
        )}
        <Text variant="caption">{viewedLabel(link.view_count, link.last_viewed_at)}</Text>
        <View className="flex-row gap-3">
          <Button label="Share link" icon="share" disabled={!url} onPress={() => void share()} />
          <Button
            testID="share-turn-off"
            label="Turn off"
            variant="ghost"
            onPress={() =>
              confirmDestructive(
                'Turn off the client link?',
                'The link stops working right away. You can create a new one later.',
                () => {
                  revoke(link);
                  // Opened directly (reload, deep link) there's no screen to go back to.
                  if (router.canGoBack()) router.back();
                  else router.replace(`/projects/${project.id}`);
                },
                'Turn off',
              )
            }
          />
        </View>
      </View>

      <SectionHeader title="Visible to the client" />
      {candidates.length === 0 ? (
        <Text variant="caption" className="px-4">
          No tasks in this project yet.
        </Text>
      ) : (
        <View className="gap-px bg-border">
          {candidates.map((t) => (
            <View
              key={t.id}
              className="min-h-[52px] flex-row items-center gap-3 bg-surface px-4 py-2"
            >
              <Text className={`flex-1 ${hidden.has(t.id) ? 'text-muted' : ''}`} numberOfLines={2}>
                {t.title}
              </Text>
              <Checkbox
                checked={!hidden.has(t.id)}
                onToggle={() => setHidden(link, t.id, !hidden.has(t.id))}
                label={`Show “${t.title}” to the client`}
              />
            </View>
          ))}
        </View>
      )}

      <SectionHeader title="Preview" />
      <View className="mx-4 rounded-card border border-border bg-bg p-4">
        <ClientViewCard view={preview} />
      </View>
    </ScrollView>
  );
}
