import { View } from 'react-native';
import type { ClientView } from '@notion2/shared';
import { Icon, Text } from '@/components/ui';

const STATUS_LABEL = { todo: 'To do', doing: 'In progress', done: 'Done' } as const;
const PROJECT_LABEL = {
  active: 'In progress',
  on_hold: 'On hold',
  done: 'Complete',
  archived: 'Archived',
} as const;

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** What the client sees. Used by the public page and the freelancer's preview. */
export function ClientViewCard({ view }: { view: ClientView }) {
  const pct = view.progress.total
    ? Math.round((view.progress.done / view.progress.total) * 100)
    : 0;
  return (
    <View className="gap-5">
      <View className="gap-1">
        {view.client_name ? <Text variant="label">{view.client_name}</Text> : null}
        <Text testID="client-view-title" variant="title" accessibilityRole="header">
          {view.project.title}
        </Text>
        <Text variant="caption">
          {PROJECT_LABEL[view.project.status]}
          {view.project.due_date ? ` · due ${formatDate(view.project.due_date)}` : ''}
          {view.from ? ` · by ${view.from}` : ''}
        </Text>
      </View>

      <View
        className="gap-2"
        accessibilityLabel={`${view.progress.done} of ${view.progress.total} done`}
      >
        <View className="flex-row justify-between">
          <Text variant="caption">Progress</Text>
          <Text testID="client-view-progress" variant="caption" className="text-text">
            {view.progress.done} of {view.progress.total} done
          </Text>
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-surface-2">
          <View className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </View>
      </View>

      {view.tasks.length === 0 ? (
        <Text variant="caption">Nothing to show yet.</Text>
      ) : (
        <View className="gap-px overflow-hidden rounded-card bg-border">
          {view.tasks.map((t, i) => (
            <View key={i} className="min-h-[52px] flex-row items-center gap-3 bg-surface px-4 py-3">
              <Icon
                name={
                  t.status === 'done' ? 'check-circle' : t.status === 'doing' ? 'loader' : 'circle'
                }
                size={18}
                color={t.status === 'done' ? 'accent' : 'faint'}
              />
              <Text className={`flex-1 ${t.status === 'done' ? 'text-muted line-through' : ''}`}>
                {t.title}
              </Text>
              <Text variant="caption">
                {t.status === 'done'
                  ? STATUS_LABEL.done
                  : t.due_date
                    ? formatDate(t.due_date)
                    : STATUS_LABEL[t.status]}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
