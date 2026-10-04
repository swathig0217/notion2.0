import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { isValidTimeZone } from '@notion2/shared';
import { Button, ListRow, SectionHeader, Text, TextField } from '@/components/ui';
import { signOut } from '@/features/auth/session';
import { useMe, type Me } from '@/features/auth/useMe';
import { keys } from '@/lib/collection';
import { supabase } from '@/lib/supabase';
import { confirmDestructive } from '@/lib/confirm';
import { clearLocalData } from '@/lib/query-client';
import { toast } from '@/lib/toast';

export default function Settings() {
  const qc = useQueryClient();
  const me = useMe().data;
  const [tz, setTz] = useState<string | null>(null);
  const [tzError, setTzError] = useState<string | null>(null);

  const saveTimeZone = async () => {
    if (!me || tz == null || tz === me.profile.timezone) return;
    if (!isValidTimeZone(tz)) {
      setTzError('Use an IANA timezone like Europe/London.');
      return;
    }
    setTzError(null);
    qc.setQueryData<Me>(keys.me, (m) =>
      m ? { ...m, profile: { ...m.profile, timezone: tz } } : m,
    );
    const { error } = await supabase.from('profiles').update({ timezone: tz }).eq('id', me.userId);
    if (error) toast.error("Couldn't save your timezone.");
    else toast.show('Timezone saved');
  };

  const deleteAccount = () =>
    confirmDestructive(
      'Delete your account?',
      'This permanently deletes your workspace, clients, projects, tasks and notes. It cannot be undone.',
      async () => {
        const { error } = await supabase.rpc('delete_my_account');
        if (error) {
          toast.error("Couldn't delete your account. Try again.");
          return;
        }
        await supabase.auth.signOut();
        await clearLocalData();
      },
      'Delete everything',
    );

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="pb-24"
      keyboardShouldPersistTaps="handled"
    >
      <SectionHeader title="Account" />
      <View className="gap-px bg-border">
        <ListRow title={me?.email ?? '—'} subtitle="Signed in with email" />
        <ListRow title={me?.workspace.name ?? '—'} subtitle="Workspace" />
      </View>

      <SectionHeader title="Timezone" />
      <View className="gap-2 px-4">
        <TextField
          value={tz ?? me?.profile.timezone ?? ''}
          onChangeText={setTz}
          onBlur={saveTimeZone}
          onSubmitEditing={saveTimeZone}
          autoCapitalize="none"
          autoCorrect={false}
          error={tzError}
          accessibilityLabel="Timezone"
        />
        <Text variant="caption">Used for “today”, overdue tasks and due dates.</Text>
      </View>

      <View className="mt-10 gap-3 px-4">
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
        <Button label="Delete account" variant="danger" onPress={deleteAccount} />
      </View>
    </ScrollView>
  );
}
