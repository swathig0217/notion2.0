import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/sentry';
import { useMe } from '@/features/auth/useMe';
import type { PushStatus } from './usePushRegistration';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

async function saveToken(userId: string): Promise<boolean> {
  const id = projectId();
  if (!id) {
    // Push tokens need an EAS project id (app.json extra.eas.projectId).
    if (__DEV__) console.warn('[push] No EAS projectId configured; skipping registration');
    return false;
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
      { onConflict: 'token' },
    );
  if (error) throw error;
  return true;
}

/** Asks for permission (only when the user turns a notification on) and stores the token. */
export function usePushRegistration(): { status: PushStatus; register: () => Promise<boolean> } {
  const me = useMe().data;
  const [status, setStatus] = useState<PushStatus>('unknown');

  useEffect(() => {
    void Notifications.getPermissionsAsync().then((p) =>
      setStatus(p.granted ? 'granted' : p.canAskAgain ? 'unknown' : 'denied'),
    );
  }, []);

  const register = useCallback(async () => {
    if (!me) return false;
    try {
      let perm = await Notifications.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
      setStatus(perm.granted ? 'granted' : 'denied');
      if (!perm.granted) return false;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      return await saveToken(me.userId);
    } catch (error) {
      reportError(error, { fn: 'push-register' });
      return false;
    }
  }, [me]);

  return { status, register };
}

/**
 * Keeps the device token fresh (without prompting) and opens the screen a notification
 * points at (`data.url`, e.g. "/brief").
 */
export function useNotificationSetup() {
  const me = useMe().data;
  useEffect(() => {
    if (!me) return;
    void Notifications.getPermissionsAsync().then((p) => {
      if (p.granted) void saveToken(me.userId).catch((e) => reportError(e, { fn: 'push-refresh' }));
    });
  }, [me]);

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
