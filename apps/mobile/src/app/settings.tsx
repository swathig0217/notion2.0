import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { isValidTimeZone } from '@notion2/shared';
import { Button, Checkbox, ListRow, SectionHeader, Text, TextField } from '@/components/ui';
import { signOut } from '@/features/auth/session';
import { useMe } from '@/features/auth/useMe';
import { useUpdateProfile } from '@/features/auth/useUpdateProfile';
import { inboundAddress, useRegenerateInbound } from '@/features/settings/inbound';
import { readPrefs, type NotificationPrefs } from '@/features/settings/prefs';
import { deleteWorkspaceFiles } from '@/features/settings/delete-files';
import { usePushRegistration } from '@/features/notifications/usePushRegistration';
import { PlanSection } from '@/features/billing/PlanSection';
import { InvoiceSettings } from '@/features/invoices/InvoiceSettings';
import { ExportSection } from '@/features/settings/ExportSection';
import { supabase } from '@/lib/supabase';
import { confirmDestructive } from '@/lib/confirm';
import { clearLocalData } from '@/lib/query-client';
import { toast } from '@/lib/toast';

const TONES = ['Warm and brief', 'Friendly and casual', 'Formal and precise'] as const;
const HOURS = [7, 8, 9, 10] as const;

function hourLabel(h: number) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2026, 0, 1, h));
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="min-h-[56px] flex-row items-center gap-3 bg-surface px-4 py-3">
      <View className="flex-1">
        <Text>{label}</Text>
        <Text variant="caption">{hint}</Text>
      </View>
      <Checkbox checked={value} onToggle={() => onChange(!value)} label={label} />
    </View>
  );
}

export default function Settings() {
  const me = useMe().data;
  const updateProfile = useUpdateProfile();
  const regenerate = useRegenerateInbound();
  const push = usePushRegistration();
  const [name, setName] = useState<string | null>(null);
  const [tone, setTone] = useState<string | null>(null);
  const [tz, setTz] = useState<string | null>(null);
  const [tzError, setTzError] = useState<string | null>(null);
  if (!me) return null;

  const prefs = readPrefs(me.profile.notification_prefs);
  const setPrefs = (patch: Partial<NotificationPrefs>) =>
    void updateProfile({ notification_prefs: { ...prefs, ...patch } });
  const address = inboundAddress(me.workspace.inbound_token);

  const saveTimeZone = async () => {
    if (tz == null || tz === me.profile.timezone) return;
    if (!isValidTimeZone(tz)) {
      setTzError('Use an IANA timezone like Europe/London.');
      return;
    }
    setTzError(null);
    if (await updateProfile({ timezone: tz })) toast.show('Timezone saved');
  };

  const deleteAccount = () =>
    confirmDestructive(
      'Delete your account?',
      'This permanently deletes your workspace, clients, projects, tasks and notes. It cannot be undone.',
      async () => {
        try {
          await deleteWorkspaceFiles(me.workspace.id);
        } catch {
          toast.error("Couldn't delete your files. Try again.");
          return;
        }
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
        <ListRow title={me.email ?? '—'} subtitle="Signed in with email" />
        <ListRow title={me.workspace.name} subtitle="Workspace" />
      </View>

      <PlanSection />

      <SectionHeader title="Writing" />
      <View className="gap-3 px-4">
        <TextField
          testID="settings-name"
          label="Your name (signs updates and follow-ups)"
          value={name ?? me.profile.display_name ?? ''}
          onChangeText={setName}
          onBlur={() =>
            name != null &&
            name !== me.profile.display_name &&
            void updateProfile({ display_name: name.trim() || null })
          }
          placeholder="Jordan"
        />
        <TextField
          testID="settings-tone"
          label="Tone for drafts"
          value={tone ?? me.profile.tone ?? ''}
          onChangeText={setTone}
          onBlur={() =>
            tone != null &&
            tone !== me.profile.tone &&
            void updateProfile({ tone: tone.trim() || null })
          }
          placeholder="e.g. Warm and brief, no jargon"
        />
        <View className="flex-row flex-wrap gap-2">
          {TONES.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="button"
              accessibilityLabel={`Use tone: ${t}`}
              onPress={() => {
                setTone(t);
                void updateProfile({ tone: t });
              }}
              className="min-h-[36px] justify-center rounded-full bg-surface-2 px-3"
            >
              <Text variant="caption" className="text-text">
                {t}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <SectionHeader title="Forward emails to your Inbox" />
      <View className="gap-3 px-4">
        {address ? (
          <>
            <Text selectable testID="inbound-address" className="font-semibold">
              {address}
            </Text>
            <Text variant="caption">
              Forward a client email here and the assistant organizes it into a proposal for you to
              review. Keep this address private.
            </Text>
            <View className="flex-row gap-3">
              <Button
                label="Share address"
                variant="secondary"
                icon="share"
                onPress={() => void Share.share({ message: address })}
              />
              <Button
                label="New address"
                variant="ghost"
                onPress={() =>
                  confirmDestructive(
                    'Create a new address?',
                    'The current address stops working immediately.',
                    async () => {
                      try {
                        await regenerate();
                        toast.show('New forwarding address ready');
                      } catch {
                        toast.error('Couldn’t create a new address.');
                      }
                    },
                    'Create',
                  )
                }
              />
            </View>
          </>
        ) : (
          <Text variant="caption">Email forwarding isn’t set up on this server yet.</Text>
        )}
      </View>

      {Platform.OS !== 'web' ? (
        <>
          <SectionHeader title="Notifications" />
          <View className="gap-px bg-border">
            <ToggleRow
              label="Daily Today digest"
              hint={`What’s due and overdue, at ${hourLabel(prefs.digest_hour)}`}
              value={prefs.digest}
              onChange={(digest) => {
                setPrefs({ digest });
                if (digest) void push.register();
              }}
            />
            <ToggleRow
              label="Follow-up nudges"
              hint="When a client hasn’t heard from you in a week"
              value={prefs.nudges}
              onChange={(nudges) => {
                setPrefs({ nudges });
                if (nudges) void push.register();
              }}
            />
          </View>
          {prefs.digest ? (
            <View className="flex-row flex-wrap gap-2 px-4 pt-3" accessibilityLabel="Digest time">
              {HOURS.map((h) => (
                <Pressable
                  key={h}
                  accessibilityRole="radio"
                  aria-checked={prefs.digest_hour === h}
                  accessibilityLabel={hourLabel(h)}
                  onPress={() => setPrefs({ digest_hour: h })}
                  className={`min-h-[36px] justify-center rounded-full px-4 ${prefs.digest_hour === h ? 'bg-accent' : 'bg-surface-2'}`}
                >
                  <Text
                    variant="caption"
                    className={prefs.digest_hour === h ? 'text-on-accent' : 'text-text'}
                  >
                    {hourLabel(h)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {push.status === 'denied' ? (
            <Text variant="caption" className="px-4 pt-2 text-danger">
              Notifications are turned off for this app in your phone’s settings.
            </Text>
          ) : null}
        </>
      ) : null}

      <SectionHeader title="Timezone" />
      <View className="gap-2 px-4">
        <TextField
          value={tz ?? me.profile.timezone}
          onChangeText={setTz}
          onBlur={saveTimeZone}
          onSubmitEditing={saveTimeZone}
          autoCapitalize="none"
          autoCorrect={false}
          error={tzError}
          accessibilityLabel="Timezone"
        />
        <Text variant="caption">
          Used for “today”, overdue tasks, due dates and notification times.
        </Text>
      </View>

      <InvoiceSettings workspace={me.workspace} />

      <ExportSection workspaceId={me.workspace.id} />

      <View className="mt-10 gap-3 px-4">
        <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
        <Button label="Delete account" variant="danger" onPress={deleteAccount} />
      </View>
    </ScrollView>
  );
}
