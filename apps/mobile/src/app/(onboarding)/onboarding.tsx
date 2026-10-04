import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { starterTemplate, todayInTimeZone, type OnboardingAnswers } from '@notion2/shared';
import { Button, ListSkeleton, Text, TextField } from '@/components/ui';
import { OptionChips } from '@/features/onboarding/OptionChips';
import { useFinishOnboarding } from '@/features/onboarding/api';
import { ProposalReview } from '@/features/ai/ProposalReview';
import {
  parseProposal,
  useApplyAction,
  useGenerateWorkspace,
  type AiAction,
} from '@/features/ai/api';
import { useTimeZone } from '@/features/auth/useMe';
import { useTrack } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';

const ROLES = [
  'Designer',
  'Developer',
  'Consultant',
  'Coach',
  'Video editor',
  'Agency',
  'Virtual assistant',
  'Something else',
] as const;
const CLIENT_COUNTS = ['1-2', '3-5', '6-10', '11+'] as const;
const HEADACHES = [
  'Invoicing and getting paid',
  'Following up with clients',
  'Writing status updates',
  'Keeping track of tasks',
  'Scope creep',
  'Scheduling',
] as const;

type Step = 'role' | 'clients' | 'headaches' | 'generating' | 'review';

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const timeZone = useTimeZone();
  const today = todayInTimeZone(timeZone);
  const generate = useGenerateWorkspace();
  const apply = useApplyAction();
  const finish = useFinishOnboarding();
  const track = useTrack();

  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [clientCount, setClientCount] = useState<OnboardingAnswers['client_count'] | null>(null);
  const [headaches, setHeadaches] = useState<string[]>([]);
  const [action, setAction] = useState<AiAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [startedAt] = useState(() => Date.now());

  const businessType = role === 'Something else' ? other.trim() || 'Freelancer' : (role ?? '');
  const answers = (): OnboardingAnswers => ({
    business_type: businessType,
    business_description: role === 'Something else' ? other.trim() : '',
    client_count: clientCount ?? '3-5',
    headaches,
  });

  const build = async () => {
    setStep('generating');
    try {
      const a = await generate(answers(), () => starterTemplate(answers(), today));
      setAction(a);
      setStep('review');
    } catch {
      toast.error('Couldn’t build your workspace. Check your connection and try again.');
      setStep('headaches');
    }
  };

  const skip = async () => {
    try {
      await finish(businessType || null);
      track('onboarding_completed', {
        generated: false,
        seconds: Math.round((Date.now() - startedAt) / 1000),
      });
      router.replace('/');
    } catch {
      toast.error('Couldn’t save. Check your connection and try again.');
    }
  };

  const proposal = action ? parseProposal(action) : null;

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }}
      contentContainerClassName="gap-6"
      keyboardShouldPersistTaps="handled"
    >
      {step === 'role' ? (
        <View className="gap-5 px-6">
          <Text variant="label">1 of 3</Text>
          <Text variant="title" accessibilityRole="header">
            What do you do?
          </Text>
          <OptionChips
            label="What you do"
            options={ROLES}
            selected={role ? [role] : []}
            onToggle={setRole}
          />
          {role === 'Something else' ? (
            <TextField
              testID="role-other"
              value={other}
              onChangeText={setOther}
              placeholder="e.g. Copywriter"
              autoFocus
            />
          ) : null}
          <Button
            label="Next"
            disabled={!role || (role === 'Something else' && !other.trim())}
            onPress={() => setStep('clients')}
          />
          <Button label="Skip, start empty" variant="ghost" onPress={skip} />
        </View>
      ) : null}

      {step === 'clients' ? (
        <View className="gap-5 px-6">
          <Text variant="label">2 of 3</Text>
          <Text variant="title" accessibilityRole="header">
            How many active clients do you have?
          </Text>
          <OptionChips
            label="Active clients"
            options={CLIENT_COUNTS}
            selected={clientCount ? [clientCount] : []}
            onToggle={(v) => setClientCount(v as OnboardingAnswers['client_count'])}
          />
          <Button label="Next" disabled={!clientCount} onPress={() => setStep('headaches')} />
          <Button label="Back" variant="ghost" onPress={() => setStep('role')} />
        </View>
      ) : null}

      {step === 'headaches' ? (
        <View className="gap-5 px-6">
          <Text variant="label">3 of 3</Text>
          <Text variant="title" accessibilityRole="header">
            What’s your biggest admin headache?
          </Text>
          <Text className="text-muted">Pick any that apply.</Text>
          <OptionChips
            multi
            label="Admin headaches"
            options={HEADACHES}
            selected={headaches}
            onToggle={(h) =>
              setHeadaches((prev) =>
                prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h],
              )
            }
          />
          <Button testID="build-workspace" label="Build my workspace" icon="zap" onPress={build} />
          <Button label="Back" variant="ghost" onPress={() => setStep('clients')} />
        </View>
      ) : null}

      {step === 'generating' ? (
        <View
          className="gap-4 px-6"
          accessibilityLiveRegion="polite"
          accessibilityLabel="Building your workspace"
        >
          <Text variant="title">Setting things up for you…</Text>
          <Text className="text-muted">
            Sample clients, a project and a first set of tasks shaped like your work.
          </Text>
          <ListSkeleton rows={6} />
        </View>
      ) : null}

      {step === 'review' && action && proposal ? (
        <View className="gap-4">
          <View className="gap-2 px-6">
            <Text variant="title" accessibilityRole="header">
              Your starter workspace
            </Text>
            <Text className="text-muted">
              Untick or rename anything. Sample clients are easy to delete later.
            </Text>
          </View>
          <ProposalReview
            proposal={proposal}
            today={today}
            busy={busy}
            acceptLabel={(n) => `Create my workspace (${n})`}
            onAccept={async (decision) => {
              setBusy(true);
              try {
                await apply(action, proposal, decision);
                await finish(businessType);
                haptics.success();
                track('onboarding_completed', {
                  generated: !proposal.fallback,
                  seconds: Math.round((Date.now() - startedAt) / 1000),
                });
                router.replace('/');
              } catch {
                toast.error('Couldn’t create your workspace. Try again.');
                setBusy(false);
              }
            }}
          />
          <View className="px-6">
            <Button label="Skip, start empty" variant="ghost" onPress={skip} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
