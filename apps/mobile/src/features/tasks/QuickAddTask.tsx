import { useState } from 'react';
import { View } from 'react-native';
import { Icon } from '@/components/ui';
import { SmartPasteInput } from '@/components/SmartPasteInput';
import { useTrack } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import { useCreateTask } from './api';

/**
 * Inline "Add a task" row. Pasting a list offers to create one task per line.
 */
export function QuickAddTask({
  defaults = {},
  placeholder = 'Add a task',
}: {
  defaults?: { client_id?: string | null; project_id?: string | null; due_date?: string | null };
  placeholder?: string;
}) {
  const [title, setTitle] = useState('');
  const createTask = useCreateTask();
  const track = useTrack();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (createTask({ title: trimmed, ...defaults })) setTitle('');
  };

  return (
    <View className="flex-row items-start gap-3 bg-surface px-4 py-3">
      <View className="pt-0.5">
        <Icon name="plus" size={22} color="accent" />
      </View>
      <View className="flex-1">
        <SmartPasteInput
          testID="quick-add-task"
          value={title}
          onChangeText={setTitle}
          placeholder={placeholder}
          accessibilityLabel={placeholder}
          returnKeyType="done"
          onSubmitEditing={submit}
          offerLabel={(n) => `Add as ${n} tasks`}
          onChecklist={(items) => {
            for (const item of items) {
              createTask({
                title: item.title,
                status: item.checked ? 'done' : 'todo',
                ...defaults,
              });
            }
            track('checklist_from_paste', { items: items.length, target: 'tasks' });
            toast.show(`Added ${items.length} tasks`);
          }}
        />
      </View>
    </View>
  );
}
