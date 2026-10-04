import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { todayInTimeZone } from '@notion2/shared';
import { Button, EmptyState, ListSkeleton, Text } from '@/components/ui';
import { ProposalReview } from '@/features/ai/ProposalReview';
import {
  parseProposal,
  useAiAction,
  useApplyAction,
  useProcessInbox,
  useRejectAction,
} from '@/features/ai/api';
import { useUndoFlow } from '@/features/ai/useUndoFlow';
import { useTimeZone } from '@/features/auth/useMe';
import { useTrack } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: action, isPending } = useAiAction(id);
  const apply = useApplyAction();
  const reject = useRejectAction();
  const process = useProcessInbox();
  const undo = useUndoFlow();
  const track = useTrack();
  const today = todayInTimeZone(useTimeZone());
  const [busy, setBusy] = useState(false);

  if (isPending) return <ListSkeleton />;
  const proposal = action ? parseProposal(action) : null;
  if (!action || !proposal) {
    return (
      <EmptyState
        icon="inbox"
        title="Proposal not found"
        action={{ label: 'Back', onPress: () => router.back() }}
      />
    );
  }

  if (action.status !== 'proposed') {
    const applied = action.status === 'accepted' || action.status === 'edited';
    return (
      <View className="flex-1 gap-4 bg-bg p-4">
        <Text>{proposal.summary}</Text>
        <Text variant="caption">
          {applied ? 'Applied.' : action.status === 'undone' ? 'Undone.' : 'Rejected.'}
        </Text>
        {applied ? (
          <Button
            label="Undo these changes"
            variant="secondary"
            icon="rotate-ccw"
            onPress={async () => {
              await undo(action);
              router.back();
            }}
          />
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-4 py-4 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      <ProposalReview
        key={action.id}
        proposal={proposal}
        today={today}
        busy={busy || process.isPending}
        onAccept={async (decision) => {
          setBusy(true);
          try {
            const plan = await apply(action, proposal, decision);
            haptics.success();
            toast.show(`Added ${plan.count} item${plan.count === 1 ? '' : 's'}`, {
              label: 'Undo',
              onPress: () => void undo({ ...action, status: plan.edited ? 'edited' : 'accepted' }),
            });
            router.back();
          } catch {
            toast.error('Couldn’t apply these changes. Nothing was changed.');
          } finally {
            setBusy(false);
          }
        }}
        onReject={async () => {
          setBusy(true);
          try {
            await reject(action);
            router.back();
          } catch {
            toast.error('Couldn’t reject. Try again.');
          } finally {
            setBusy(false);
          }
        }}
        onAnswer={
          action.inbox_item_id
            ? (question, answer) => {
                const inboxItemId = action.inbox_item_id;
                if (!inboxItemId) return;
                track('ai_clarification_answered');
                // The old proposal is superseded by the one built with the answer.
                void reject(action).catch(() => undefined);
                process.mutate({ inboxItemId, clarification: { question, answer } });
                router.back();
              }
            : undefined
        }
      />
    </ScrollView>
  );
}
