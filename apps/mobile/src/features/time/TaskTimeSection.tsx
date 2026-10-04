import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { formatClock, formatDuration, parseDuration, totalMinutes } from '@notion2/shared';
import {
  Button,
  Checkbox,
  Icon,
  IconButton,
  SectionHeader,
  Text,
  TextField,
} from '@/components/ui';
import type { Task } from '@/features/tasks/api';
import {
  useAddManualEntry,
  useDeleteEntry,
  useStartTimer,
  useStopTimer,
  useTimeEntries,
} from './api';
import { useNow } from './useNow';

const QUICK = [15, 30, 60, 120];

function entryDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(iso),
  );
}

export function TaskTimeSection({ task }: { task: Task }) {
  const { data } = useTimeEntries();
  const entries = useMemo(() => (data ?? []).filter((e) => e.task_id === task.id), [data, task.id]);
  const running = entries.find((e) => e.ended_at == null);
  const now = useNow(running != null);
  const start = useStartTimer();
  const stop = useStopTimer();
  const addManual = useAddManualEntry();
  const remove = useDeleteEntry();
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const total = totalMinutes(entries, now);

  const add = (minutes: number | null) => {
    if (minutes == null || minutes <= 0) {
      setError('Try “45”, “1h30” or “1:15”.');
      return;
    }
    addManual(task, minutes, billable);
    setAdding(false);
    setCustom('');
    setError(null);
  };

  return (
    <View>
      <SectionHeader
        title="Time"
        right={
          <Text testID="time-total" variant="caption" className="font-semibold text-text">
            {formatDuration(total.minutes)}
          </Text>
        }
      />
      <View className="gap-3 px-4">
        <View className="flex-row gap-3">
          {running ? (
            <Button
              testID="timer-stop"
              label={`Stop ${formatClock((now.getTime() - new Date(running.started_at).getTime()) / 1000)}`}
              icon="square"
              onPress={stop}
              className="flex-1"
            />
          ) : (
            <Button
              testID="timer-start"
              label="Start timer"
              icon="play"
              variant="secondary"
              onPress={() => start(task)}
              className="flex-1"
            />
          )}
          <Button
            label="Add time"
            icon="plus"
            variant="ghost"
            onPress={() => setAdding((v) => !v)}
          />
        </View>

        {adding ? (
          <View className="gap-3 rounded-card bg-surface p-3">
            <View className="flex-row flex-wrap gap-2">
              {QUICK.map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${formatDuration(m)}`}
                  onPress={() => add(m)}
                  className="min-h-[36px] justify-center rounded-full bg-surface-2 px-4"
                >
                  <Text variant="caption" className="text-text">
                    {formatDuration(m)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextField
              testID="manual-duration"
              value={custom}
              onChangeText={(t) => {
                setCustom(t);
                setError(null);
              }}
              placeholder="Other, e.g. 1h30"
              accessibilityLabel="Duration"
              returnKeyType="done"
              onSubmitEditing={() => add(parseDuration(custom))}
              error={error}
            />
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Checkbox
                  checked={billable}
                  onToggle={() => setBillable((b) => !b)}
                  label="Billable"
                  size={20}
                />
                <Text variant="caption" className="text-text">
                  Billable
                </Text>
              </View>
              <Button
                testID="manual-add"
                label="Add"
                variant="secondary"
                disabled={!custom.trim()}
                onPress={() => add(parseDuration(custom))}
              />
            </View>
          </View>
        ) : null}
      </View>

      {entries.filter((e) => e.ended_at != null).length > 0 ? (
        <View className="mt-2 gap-px bg-border">
          {entries
            .filter((e) => e.ended_at != null)
            .map((e) => (
              <View key={e.id} className="min-h-[44px] flex-row items-center gap-3 bg-surface px-4">
                <Icon name="clock" size={14} color="faint" />
                <Text className="flex-1">{formatDuration(e.minutes ?? 0)}</Text>
                <Text variant="caption">
                  {entryDate(e.started_at)}
                  {e.billable ? '' : ' · non-billable'}
                  {e.invoice_id ? ' · invoiced' : ''}
                </Text>
                {/* Invoiced time is locked; delete the draft invoice to release it. */}
                {e.invoice_id ? (
                  <Icon name="lock" size={14} color="faint" />
                ) : (
                  <IconButton
                    icon="x"
                    label={`Delete ${formatDuration(e.minutes ?? 0)} entry`}
                    onPress={() => remove(e)}
                  />
                )}
              </View>
            ))}
        </View>
      ) : null}
    </View>
  );
}
