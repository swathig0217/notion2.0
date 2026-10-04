import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Icon, Text, TextField } from '@/components/ui';
import { isSampleClientName } from '@notion2/shared';
import { useCreateClient } from '@/features/clients/api';
import { openPaywall, useClientLimitReached } from '@/features/billing/api';
import { CLIENT_COLORS } from '@/theme/tokens';
import { z } from 'zod';

export default function NewClient() {
  const create = useCreateClient();
  const limitReached = useClientLimitReached();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [color, setColor] = useState<string>(CLIENT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!name.trim()) return setError('Give the client a name.');
    if (limitReached && !isSampleClientName(name.trim())) return openPaywall('clients');
    if (email.trim() && !z.email().safeParse(email.trim()).success)
      return setError('That email looks off.');
    const client = create({ name: name.trim(), email: email.trim() || null, color });
    if (client) router.replace(`/clients/${client.id}`);
  };

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-5 p-5"
      keyboardShouldPersistTaps="handled"
    >
      <TextField
        testID="client-name"
        label="Name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        placeholder="Acme Co"
        autoFocus
        returnKeyType="next"
        error={error}
      />
      <TextField
        label="Email (optional)"
        value={email}
        onChangeText={setEmail}
        placeholder="sam@acme.com"
        autoCapitalize="none"
        keyboardType="email-address"
        onSubmitEditing={save}
      />
      <View className="gap-2">
        <Text variant="caption">Color</Text>
        <View
          className="flex-row flex-wrap gap-3"
          accessibilityRole="radiogroup"
          accessibilityLabel="Client color"
        >
          {CLIENT_COLORS.map((c, i) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityLabel={`Color ${i + 1}`}
              aria-selected={color === c}
              onPress={() => setColor(c)}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: c }}
            >
              {color === c ? <Icon name="check" size={18} color="on-accent" /> : null}
            </Pressable>
          ))}
        </View>
      </View>
      <Button testID="save-client" label="Add client" onPress={save} />
    </ScrollView>
  );
}
