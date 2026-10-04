import { useMemo, useState } from 'react';
import { Pressable, Share, TextInput, View } from 'react-native';
import {
  formatDueLabel,
  isApplyable,
  type AiProposal,
  type ProposedChange,
  type ReviewDecision,
} from '@notion2/shared';
import { Button, Checkbox, Icon, Text, TextField, type IconName } from '@/components/ui';
import { useColors } from '@/theme/useColors';
import { useClients } from '@/features/clients/api';
import { useProjects } from '@/features/projects/api';

const OP_ICON: Record<ProposedChange['op'], IconName> = {
  create_client: 'user-plus',
  create_project: 'folder-plus',
  create_task: 'check-circle',
  create_note: 'file-text',
  draft_reply: 'mail',
};
const OP_LABEL: Record<ProposedChange['op'], string> = {
  create_client: 'New client',
  create_project: 'New project',
  create_task: 'Task',
  create_note: 'Note',
  draft_reply: 'Draft reply',
};

function titleOf(change: ProposedChange): string {
  switch (change.op) {
    case 'create_client':
      return change.name;
    case 'draft_reply':
      return 'Reply';
    default:
      return change.title;
  }
}

export interface ProposalReviewProps {
  proposal: AiProposal & { fallback?: boolean };
  today: string;
  acceptLabel?: (count: number) => string;
  busy?: boolean;
  onAccept: (decision: ReviewDecision) => void;
  onReject?: () => void;
  onAnswer?: (question: string, answer: string) => void;
}

/**
 * Shows every proposed change with a checkbox and an editable title. Nothing is applied
 * until the user taps Accept; drafts are copied/shared, never sent automatically.
 */
export function ProposalReview({
  proposal,
  today,
  acceptLabel,
  busy,
  onAccept,
  onReject,
  onAnswer,
}: ProposalReviewProps) {
  const colors = useColors();
  const clients = useClients().data;
  const projects = useProjects().data;
  const changes = proposal.proposed_changes;
  const [selected, setSelected] = useState(
    () => new Set(changes.filter(isApplyable).map((c) => c.ref)),
  );
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [removedSubtasks, setRemovedSubtasks] = useState<Set<string>>(new Set());
  const [answer, setAnswer] = useState('');

  // Names for ids: existing entities, or entities proposed in this same response.
  const nameFor = useMemo(() => {
    const names = new Map<string, string>();
    clients?.forEach((c) => names.set(c.id, c.name));
    projects?.forEach((p) => names.set(p.id, p.title));
    changes.forEach((c) => {
      if (c.op === 'create_client') names.set(c.ref, c.name);
      if (c.op === 'create_project') names.set(c.ref, c.title);
    });
    return (id: string | null) => (id ? (names.get(id) ?? null) : null);
  }, [clients, projects, changes]);

  const toggle = (ref: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  const toggleSubtask = (key: string) =>
    setRemovedSubtasks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const count = changes.filter((c) => isApplyable(c) && selected.has(c.ref)).length;
  const question = proposal.questions[0];

  return (
    <View className="gap-4">
      <View className="gap-1 px-4">
        <Text testID="proposal-summary">{proposal.summary}</Text>
        {proposal.fallback ? (
          <Text variant="caption">
            The assistant couldn’t organize this one, so it’s saved as a single task.
          </Text>
        ) : null}
      </View>

      {question && onAnswer ? (
        <View className="mx-4 gap-2 rounded-card bg-accent-soft p-4">
          <View className="flex-row items-center gap-2">
            <Icon name="help-circle" size={18} color="accent" />
            <Text className="font-semibold">Quick question</Text>
          </View>
          <Text testID="proposal-question">{question}</Text>
          <TextField
            testID="clarification-answer"
            value={answer}
            onChangeText={setAnswer}
            placeholder="Your answer"
            accessibilityLabel="Answer the question"
            returnKeyType="send"
            onSubmitEditing={() => answer.trim() && onAnswer(question, answer.trim())}
          />
          <Button
            label="Answer and update"
            variant="secondary"
            disabled={!answer.trim() || busy}
            onPress={() => onAnswer(question, answer.trim())}
          />
        </View>
      ) : null}

      <View className="gap-px bg-border">
        {changes.map((change) => {
          const on = selected.has(change.ref);
          if (change.op === 'draft_reply') {
            const to = nameFor(change.to_client_id);
            return (
              <View key={change.ref} className="gap-2 bg-surface px-4 py-3">
                <View className="flex-row items-center gap-2">
                  <Icon name="mail" size={16} color="accent" />
                  <Text variant="caption">Draft reply{to ? ` to ${to}` : ''}</Text>
                </View>
                <Text selectable>{change.body}</Text>
                <Button
                  label="Share draft"
                  variant="ghost"
                  icon="share"
                  onPress={() => void Share.share({ message: change.body })}
                />
              </View>
            );
          }
          const meta = [
            OP_LABEL[change.op],
            'client_id' in change ? nameFor(change.client_id) : null,
            'project_id' in change ? nameFor(change.project_id) : null,
            'due_date' in change && change.due_date ? formatDueLabel(change.due_date, today) : null,
            change.op === 'create_task' && change.priority !== 'none'
              ? `${change.priority} priority`
              : null,
          ].filter(Boolean);
          const original = titleOf(change);
          return (
            <View
              key={change.ref}
              testID={`change-${change.ref}`}
              className={`gap-2 bg-surface px-4 py-3 ${on ? '' : 'opacity-50'}`}
            >
              <View className="flex-row items-start gap-3">
                <View className="pt-1">
                  <Checkbox
                    checked={on}
                    onToggle={() => toggle(change.ref)}
                    label={`Include ${original}`}
                    size={22}
                  />
                </View>
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <Icon name={OP_ICON[change.op]} size={14} color="muted" />
                    <Text variant="caption" numberOfLines={1} className="flex-1">
                      {meta.join(' · ')}
                    </Text>
                  </View>
                  <TextInput
                    value={titles[change.ref] ?? original}
                    onChangeText={(t) => setTitles((prev) => ({ ...prev, [change.ref]: t }))}
                    editable={on}
                    multiline
                    accessibilityLabel={`Edit ${OP_LABEL[change.op].toLowerCase()} title`}
                    placeholderTextColor={colors.faint}
                    maxFontSizeMultiplier={1.8}
                    className="text-[16px] text-text"
                  />
                </View>
              </View>
              {change.op === 'create_task' && change.subtasks.length > 0 && on ? (
                <View className="ml-9 gap-1.5">
                  {change.subtasks.map((s, i) => {
                    const key = `${change.ref}:${i}`;
                    const kept = !removedSubtasks.has(key);
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="checkbox"
                        aria-checked={kept}
                        accessibilityLabel={`Include subtask ${s}`}
                        onPress={() => toggleSubtask(key)}
                        className="flex-row items-center gap-2"
                      >
                        <Icon
                          name={kept ? 'check-square' : 'square'}
                          size={16}
                          color={kept ? 'accent' : 'faint'}
                        />
                        <Text variant="caption" className={kept ? 'text-text' : 'line-through'}>
                          {s}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {change.op === 'create_note' && on ? (
                <Text variant="caption" numberOfLines={4} className="ml-9">
                  {change.content}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      <View className="flex-row gap-3 px-4">
        {onReject ? (
          <Button
            label="Reject"
            variant="secondary"
            disabled={busy}
            onPress={onReject}
            className="flex-1"
          />
        ) : null}
        <Button
          testID="accept-proposal"
          label={busy ? 'Applying…' : acceptLabel ? acceptLabel(count) : `Accept ${count}`}
          disabled={busy || count === 0}
          onPress={() => onAccept({ selected, titles, removedSubtasks })}
          className="flex-[2]"
        />
      </View>
    </View>
  );
}
