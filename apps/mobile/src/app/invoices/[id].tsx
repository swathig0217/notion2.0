import { Platform, ScrollView, Share, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { formatMoney, formatQuantity, renderInvoiceText, todayInTimeZone } from '@notion2/shared';
import { Button, EmptyState, IconButton, ListSkeleton, Text } from '@/components/ui';
import { useMe, useTimeZone } from '@/features/auth/useMe';
import {
  PENDING_NUMBER,
  useDeleteInvoice,
  useInvoice,
  useInvoiceItems,
  useSetInvoiceStatus,
} from '@/features/invoices/api';
import { invoiceStatusLabel } from '@/features/invoices/status';
import { confirmDestructive } from '@/lib/confirm';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: invoice, isPending } = useInvoice(id);
  const items = useInvoiceItems(id).data ?? [];
  const me = useMe().data;
  const today = todayInTimeZone(useTimeZone());
  const setStatus = useSetInvoiceStatus();
  const remove = useDeleteInvoice();

  if (isPending) return <ListSkeleton />;
  if (!invoice) {
    return (
      <EmptyState
        icon="file"
        title="Invoice not found"
        action={{ label: 'Back', onPress: () => router.back() }}
      />
    );
  }

  const numbered = invoice.number !== PENDING_NUMBER;
  const text = renderInvoiceText({
    ...invoice,
    lines: items,
    from: me?.profile.display_name ?? null,
    details: me?.workspace.invoice_details ?? null,
  });

  const share = async () => {
    if (!numbered) {
      toast.show('Still saving… try again in a moment.');
      return;
    }
    try {
      const result = await Share.share({ message: text, title: `Invoice ${invoice.number}` });
      if (result.action === Share.sharedAction && invoice.status === 'draft') {
        setStatus(invoice, 'sent');
        toast.show('Marked as sent');
      }
    } catch {
      toast.error('Couldn’t open the share sheet.');
    }
  };

  const money = (c: number) => formatMoney(c, invoice.currency);

  return (
    <>
      <Stack.Screen
        options={{
          title: invoice.number,
          headerRight:
            invoice.status === 'draft'
              ? () => (
                  <IconButton
                    icon="trash-2"
                    label="Delete draft invoice"
                    onPress={() =>
                      confirmDestructive(
                        'Delete this draft?',
                        'Its time goes back to unbilled.',
                        () => {
                          remove(invoice);
                          router.back();
                        },
                      )
                    }
                  />
                )
              : undefined,
        }}
      />
      <ScrollView className="flex-1 bg-bg" contentContainerClassName="gap-5 p-4 pb-24">
        <View className="gap-1">
          <Text testID="invoice-number" variant="title">
            {invoice.number}
          </Text>
          <Text testID="invoice-status" className="font-semibold">
            {invoiceStatusLabel(invoice, today)}
          </Text>
          <Text variant="caption">
            {invoice.client_name} · issued {invoice.issue_date}
            {invoice.due_date ? ` · due ${invoice.due_date}` : ''}
          </Text>
        </View>

        <View className="gap-px overflow-hidden rounded-card bg-border">
          {items.map((l) => (
            <View key={l.id} className="flex-row items-center gap-3 bg-surface px-4 py-3">
              <View className="flex-1">
                <Text>{l.description}</Text>
                <Text variant="caption">
                  {formatQuantity(l.quantity)} × {money(l.unit_price_cents)}
                </Text>
              </View>
              <Text className="font-semibold">{money(l.amount_cents)}</Text>
            </View>
          ))}
          <View className="flex-row items-center justify-between bg-surface px-4 py-3">
            <Text variant="heading">Total</Text>
            <Text testID="invoice-detail-total" variant="heading">
              {money(invoice.total_cents)}
            </Text>
          </View>
        </View>
        {invoice.notes ? <Text variant="caption">{invoice.notes}</Text> : null}
        {!me?.workspace.invoice_details ? (
          <Text variant="caption">
            Tip: add your business details and payment instructions in Settings so they appear on
            every invoice.
          </Text>
        ) : null}

        <View className="gap-3">
          {invoice.status !== 'void' ? (
            <Button
              testID="invoice-share"
              label={invoice.status === 'draft' ? 'Send (share)' : 'Share again'}
              icon="share"
              onPress={() => void share()}
            />
          ) : null}
          {Platform.OS === 'web' ? (
            <Button
              label="Print or save as PDF"
              icon="printer"
              variant="secondary"
              onPress={() => window.print()}
            />
          ) : null}
          {invoice.status === 'draft' ? (
            <>
              <Button
                testID="invoice-edit"
                label="Edit"
                icon="edit-3"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/invoices/new', params: { invoiceId: invoice.id } })
                }
              />
              <Button
                testID="invoice-mark-sent"
                label="Mark as sent"
                variant="ghost"
                onPress={() => {
                  setStatus(invoice, 'sent');
                  toast.show('Marked as sent');
                }}
              />
            </>
          ) : null}
          {invoice.status === 'sent' ? (
            <>
              <Button
                testID="invoice-mark-paid"
                label="Mark as paid"
                icon="check-circle"
                variant="secondary"
                onPress={() => {
                  setStatus(invoice, 'paid');
                  haptics.success();
                  toast.show('Paid. Nice.');
                }}
              />
              <Button
                label="Void invoice"
                variant="ghost"
                onPress={() =>
                  confirmDestructive(
                    'Void this invoice?',
                    'It stays on record as void. Its time stays billed.',
                    () => setStatus(invoice, 'void'),
                    'Void',
                  )
                }
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
