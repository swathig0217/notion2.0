import { useEffect } from 'react';
import { router } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';
import { INBOX_MAX_CHARS, shareToCapture } from '@notion2/shared';
import { useTrack } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import { setPendingShare } from './pending';

/**
 * Text, links and images shared from other apps open Dump it, prefilled. Nothing is
 * saved until the user taps "Dump it". `enabled` is false until signed in and onboarded.
 */
export function useShareIntake(enabled: boolean) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    resetOnBackground: true,
  });
  const track = useTrack();

  useEffect(() => {
    if (!enabled || !hasShareIntent) return;
    const capture = shareToCapture(shareIntent, INBOX_MAX_CHARS);
    resetShareIntent();
    if (capture.mode === 'unsupported') {
      toast.error(
        capture.reason === 'file_type'
          ? 'Share text, a link or an image (JPEG, PNG or WebP).'
          : 'Nothing to capture in that share.',
      );
      return;
    }
    track('share_received', { mode: capture.mode });
    setPendingShare(capture);
    router.push('/capture?shared=1');
  }, [enabled, hasShareIntent, shareIntent, resetShareIntent, track]);
}
