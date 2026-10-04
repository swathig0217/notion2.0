import { router } from 'expo-router';
import { queryClient } from '@/lib/query-client';
import { toast } from '@/lib/toast';
import { configureAiMutations, parseProposal } from './api';

// Registered once at startup (imported by the root layout).
configureAiMutations(queryClient, (action) => {
  const proposal = parseProposal(action);
  const message = proposal?.questions.length
    ? 'The assistant has a quick question'
    : 'Proposal ready to review';
  toast.show(message, { label: 'Review', onPress: () => router.push(`/review/${action.id}`) });
});
