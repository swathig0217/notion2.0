import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Button, IconButton, Text, TextField } from '@/components/ui';
import { sendMagicLink } from '@/features/auth/api';
import { env } from '@/lib/env';

const Email = z.email();

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const submit = async () => {
    const parsed = Email.safeParse(email.trim());
    if (!parsed.success) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setState('sending');
    try {
      await sendMagicLink(parsed.data);
      setState('sent');
    } catch {
      setState('idle');
      setError("We couldn't send the link. Check your connection and try again.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-bg"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
    >
      <View className="px-2">
        <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
      </View>
      <View className="flex-1 gap-5 px-6 pt-6">
        {state === 'sent' ? (
          <View className="gap-3" accessibilityLiveRegion="polite">
            <Text variant="title" accessibilityRole="header">
              Check your email
            </Text>
            <Text className="text-muted">
              We sent a sign-in link to {email.trim()}. Open it on this device to continue.
            </Text>
            <Button
              label="Use a different email"
              variant="ghost"
              onPress={() => setState('idle')}
            />
          </View>
        ) : (
          <>
            <Text variant="title" accessibilityRole="header">
              Sign in
            </Text>
            <Text className="text-muted">No password. We’ll email you a link.</Text>
            <TextField
              testID="email-input"
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@studio.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={submit}
              error={error}
              autoFocus
            />
            <Button
              label={state === 'sending' ? 'Sending…' : 'Email me a link'}
              disabled={state === 'sending'}
              onPress={submit}
            />
            {env.authAppleEnabled ? (
              <Button label="Continue with Apple" variant="secondary" icon="smartphone" disabled />
            ) : null}
            {env.authGoogleEnabled ? (
              <Button label="Continue with Google" variant="secondary" icon="globe" disabled />
            ) : null}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
