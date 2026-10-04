import { View } from 'react-native';
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS, type WebhookEvent } from '@notion2/shared';
import { Checkbox, Text } from '@/components/ui';

export function EventPicker({
  value,
  onChange,
}: {
  value: readonly string[];
  onChange: (events: WebhookEvent[]) => void;
}) {
  const selected = new Set(value);
  return (
    <View className="gap-px bg-border">
      {WEBHOOK_EVENTS.map((e) => (
        <View key={e} className="min-h-[52px] flex-row items-center gap-3 bg-surface px-4 py-2">
          <View className="flex-1">
            <Text>{WEBHOOK_EVENT_LABELS[e]}</Text>
            <Text variant="caption">{e}</Text>
          </View>
          <Checkbox
            checked={selected.has(e)}
            label={WEBHOOK_EVENT_LABELS[e]}
            onToggle={() => {
              const next = new Set(selected);
              if (next.has(e)) next.delete(e);
              else next.add(e);
              onChange(WEBHOOK_EVENTS.filter((x) => next.has(x)));
            }}
          />
        </View>
      ))}
    </View>
  );
}
