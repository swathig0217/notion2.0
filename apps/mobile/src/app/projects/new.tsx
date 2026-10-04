import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Text, TextField } from '@/components/ui';
import { useCreateProject } from '@/features/projects/api';
import { useClient } from '@/features/clients/api';

export default function NewProject() {
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const { data: client } = useClient(clientId);
  const create = useCreateProject();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!title.trim()) return setError('Give the project a name.');
    const project = create({ title: title.trim(), client_id: clientId ?? null });
    if (project) router.replace(`/projects/${project.id}`);
  };

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-5 p-5"
      keyboardShouldPersistTaps="handled"
    >
      {client ? <Text variant="caption">For {client.name}</Text> : null}
      <TextField
        testID="project-title"
        label="Project name"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          setError(null);
        }}
        placeholder="Website refresh"
        autoFocus
        onSubmitEditing={save}
        error={error}
      />
      <Button label="Create project" onPress={save} />
    </ScrollView>
  );
}
