import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  daysBetween,
  defaultDueDate,
  formatMoney,
  formatQuantity,
  invoiceTotal,
  lineAmount,
  linesFromTime,
  parseMoney,
  parseQuantity,
  todayInTimeZone,
  type InvoiceLine,
} from '@notion2/shared';
import { Button, IconButton, SectionHeader, Text, TextField } from '@/components/ui';
import { useMe, useTimeZone } from '@/features/auth/useMe';
import { useUpdateClient, type Client } from '@/features/clients/api';
import { useTimeEntries } from '@/features/time/api';
import { newId } from '@/lib/ids';
import { haptics } from '@/lib/haptics';
import { useSaveInvoice, type Invoice, type InvoiceItem } from './api';
import { useUnbilled } from './useUnbilled';

const TERMS = [7, 14, 30] as const;

interface LineForm {
  id: string;
  description: string;
  quantity: string;
  price: string;
  task_id: string | null;
  /** Lines made from tracked time follow the hourly rate field. */
  fromTime: boolean;
}

const centsToInput = (cents: number | null | undefined) =>
  cents == null ? '' : (cents / 100).toFixed(2).replace(/\.00$/, '');

/** Creates an invoice from unbilled time, or edits an existing draft. */
export function InvoiceEditor({
  client,
  invoice,
  items,
}: {
  client: Client | undefined;
  invoice?: Invoice;
  items?: InvoiceItem[];
}) {
  const me = useMe().data;
  const today = todayInTimeZone(useTimeZone());
  const unbilled = useUnbilled(client?.id ?? invoice?.client_id ?? undefined);
  const allEntries = useTimeEntries().data;
  const save = useSaveInvoice();
  const updateClient = useUpdateClient();
  const currency = invoice?.currency ?? me?.workspace.currency ?? 'USD';

  const [rate, setRate] = useState(centsToInput(client?.hourly_rate_cents));
  const [terms, setTerms] = useState<number>(
    invoice?.due_date ? daysBetween(invoice.issue_date, invoice.due_date) : 14,
  );
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  // Time billed on this draft stays on it; new invoices take all unbilled time.
  const timeEntryIds = useMemo(() => {
    const own = invoice ? (allEntries ?? []).filter((e) => e.invoice_id === invoice.id) : [];
    return invoice ? own.map((e) => e.id) : unbilled.entries.map((e) => e.id);
  }, [invoice, allEntries, unbilled.entries]);

  const [lines, setLines] = useState<LineForm[]>(() => {
    if (items?.length) {
      return items.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: formatQuantity(i.quantity),
        price: centsToInput(i.unit_price_cents),
        task_id: i.task_id,
        fromTime: false,
      }));
    }
    const fromTime = linesFromTime(
      unbilled.entries,
      unbilled.tasks,
      unbilled.projects,
      client?.hourly_rate_cents ?? 0,
      newId,
    );
    if (fromTime.length === 0)
      return [
        { id: newId(), description: '', quantity: '1', price: '', task_id: null, fromTime: false },
      ];
    return fromTime.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: formatQuantity(l.quantity),
      price: centsToInput(client?.hourly_rate_cents ?? null),
      task_id: l.task_id,
      fromTime: true,
    }));
  });

  const setLine = (id: string, patch: Partial<LineForm>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const onRate = (value: string) => {
    setRate(value);
    setLines((ls) => ls.map((l) => (l.fromTime ? { ...l, price: value } : l)));
  };

  const parsed = lines.map((l) => ({
    form: l,
    quantity: parseQuantity(l.quantity),
    price: parseMoney(l.price),
  }));
  const total = invoiceTotal(
    parsed.map((p) => ({ quantity: p.quantity ?? 0, unit_price_cents: p.price ?? 0 })),
  );
  const hasTime = lines.some((l) => l.fromTime);

  const onSave = async () => {
    if (!me || !client) return;
    const valid: InvoiceLine[] = [];
    for (const p of parsed) {
      if (!p.form.description.trim()) return setError('Every line needs a description.');
      if (p.quantity == null) return setError(`Check the quantity for “${p.form.description}”.`);
      if (p.price == null) return setError(`Check the price for “${p.form.description}”.`);
      valid.push({
        id: p.form.id,
        description: p.form.description.trim(),
        quantity: p.quantity,
        unit_price_cents: p.price,
        task_id: p.form.task_id,
      });
    }
    if (valid.length === 0) return setError('Add at least one line.');
    setError(null);
    const issue = invoice?.issue_date ?? today;
    const row = await save(
      {
        id: invoice?.id ?? newId(),
        workspace_id: me.workspace.id,
        client_id: client.id,
        client_name: client.name,
        client_email: client.email,
        issue_date: issue,
        due_date: defaultDueDate(issue, terms),
        currency,
        notes: notes.trim() || null,
      },
      valid,
      timeEntryIds,
    );
    // Remember the rate for this client's next invoice.
    const rateCents = parseMoney(rate);
    if (hasTime && rateCents != null && rateCents !== client.hourly_rate_cents)
      updateClient(client.id, { hourly_rate_cents: rateCents });
    haptics.success();
    router.replace(`/invoices/${row.id}`);
  };

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="pb-24"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1 px-4 pt-3">
        <Text variant="heading">{client?.name ?? invoice?.client_name}</Text>
        <Text variant="caption">
          {hasTime
            ? 'Lines come from your unbilled time. Edit anything before saving.'
            : 'No unbilled time for this client. Add lines by hand.'}
        </Text>
      </View>

      {hasTime ? (
        <View className="px-4 pt-4">
          <TextField
            testID="invoice-rate"
            label={`Hourly rate (${currency})`}
            value={rate}
            onChangeText={onRate}
            keyboardType="decimal-pad"
            placeholder="100"
          />
        </View>
      ) : null}

      <SectionHeader title="Lines" />
      <View className="gap-4 px-4">
        {lines.map((l, index) => {
          const p = parsed[index];
          const amount =
            p?.quantity != null && p.price != null ? lineAmount(p.quantity, p.price) : null;
          return (
            <View key={l.id} className="gap-2 rounded-card bg-surface p-3">
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <TextField
                    testID={`line-description-${index}`}
                    accessibilityLabel={`Line ${index + 1} description`}
                    value={l.description}
                    onChangeText={(description) => setLine(l.id, { description })}
                    placeholder="What you did"
                    maxLength={500}
                  />
                </View>
                <IconButton
                  icon="x"
                  label={`Remove line ${index + 1}`}
                  onPress={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                />
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-24">
                  <TextField
                    testID={`line-quantity-${index}`}
                    accessibilityLabel={`Line ${index + 1} quantity${l.fromTime ? ' in hours' : ''}`}
                    value={l.quantity}
                    onChangeText={(quantity) => setLine(l.id, { quantity })}
                    keyboardType="decimal-pad"
                  />
                </View>
                <Text variant="caption">{l.fromTime ? 'h ×' : '×'}</Text>
                <View className="flex-1">
                  <TextField
                    testID={`line-price-${index}`}
                    accessibilityLabel={`Line ${index + 1} price`}
                    value={l.price}
                    onChangeText={(price) => setLine(l.id, { price, fromTime: false })}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
                <Text className="min-w-[80px] text-right font-semibold">
                  {amount == null ? '—' : formatMoney(amount, currency)}
                </Text>
              </View>
            </View>
          );
        })}
        <View className="flex-row">
          <Button
            testID="add-line"
            label="Add line"
            icon="plus"
            variant="ghost"
            onPress={() =>
              setLines((ls) => [
                ...ls,
                {
                  id: newId(),
                  description: '',
                  quantity: '1',
                  price: '',
                  task_id: null,
                  fromTime: false,
                },
              ])
            }
          />
        </View>
      </View>

      <SectionHeader title="Payment due" />
      <View className="flex-row gap-2 px-4" accessibilityLabel="Payment terms">
        {TERMS.map((d) => (
          <Pressable
            key={d}
            accessibilityRole="radio"
            aria-checked={terms === d}
            accessibilityLabel={`Due in ${d} days`}
            onPress={() => setTerms(d)}
            className={`min-h-[36px] justify-center rounded-full px-4 ${terms === d ? 'bg-accent' : 'bg-surface-2'}`}
          >
            <Text variant="caption" className={terms === d ? 'text-on-accent' : 'text-text'}>
              {d} days
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="gap-3 px-4 pt-5">
        <TextField
          label="Note on the invoice (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Thanks for your business!"
          maxLength={2000}
          multiline
        />
        <View className="flex-row items-center justify-between pt-2">
          <Text variant="heading">Total</Text>
          <Text testID="invoice-total" variant="heading">
            {formatMoney(total, currency)}
          </Text>
        </View>
        {error ? (
          <Text className="text-danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button
          testID="save-invoice"
          label={invoice ? 'Save changes' : 'Save draft'}
          icon="check"
          disabled={!client}
          onPress={() => void onSave()}
        />
      </View>
    </ScrollView>
  );
}
