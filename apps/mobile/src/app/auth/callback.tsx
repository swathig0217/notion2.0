import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Text } from '@/components/ui';
import { exchangeCode } from '@/features/auth/api';
import { useSession } from '@/features/auth/session';
import { supabase } from '@/lib/supabase';

/** Magic-link landing route. Web: supabase-js exchanges the code itself. Native: we do. */
export default function AuthCallback() {
  const { code, error_description } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const { session } = useSession();
  const [error, setError] = useState<string | null>(error_description ?? null);
  const started = useRef(false);

  useEffect(() => {
    if (session) {
      router.replace('/');
      return;
    }
    if (!code || started.current) return;
    started.current = true;
    void (async () => {
      const existing = await supabase.auth.getSession();
      if (existing.data.session) return; // web auto-detection already finished
      try {
        await exchangeCode(code);
      } catch {
        setError('This sign-in link has expired or was already used.');
      }
    })();
  }, [code, session]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-bg px-6">
      {error ? (
        <>
          <Text variant="heading" className="text-center">
            {error}
          </Text>
          <Button label="Send a new link" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <Text className="text-muted">Signing you in…</Text>
      )}
    </View>
  );
}
