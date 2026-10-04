import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { formatDuration, formatMoney, todayInTimeZone } from '@notion2/shared';
import { Button, ListRow, SectionHeader, Text } from '@/components/ui';
import { useTimeZone } from '@/features/auth/useMe';
import type { Client } from '@/features/clients/api';
import { useInvoices } from './api';
import { invoiceStatusLabel } from './status';
import { useUnbilled } from './useUnbilled';

/** Invoices on a client page, with unbilled time and a one-tap "Create invoice". */
export function ClientInvoices({ client }: { client: Client }) {
  const invoices = useInvoices().data;
  const unbilled = useUnbilled(client.id);
  const today = todayInTimeZone(useTimeZone());
  const list = useMemo(
    () => (invoices ?? []).filter((i) => i.client_id === client.id),
    [invoices, client.id],
  );

  return (
    <>
      <SectionHeader title="Invoices" />
      <View className="gap-3 px-4 pb-3">
        <Text variant="caption" testID="unbilled-time">
          {unbilled.minutes > 0
            ? `${formatDuration(unbilled.minutes)} of billable time not invoiced yet`
            : 'No unbilled time.'}
        </Text>
        <View className="flex-row">
          <Button
            testID="create-invoice"
            label="Create invoice"
            icon="file-plus"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/invoices/new', params: { clientId: client.id } })
            }
          />
        </View>
      </View>
      {list.length > 0 ? (
        <View className="gap-px bg-border">
          {list.map((i) => (
            <ListRow
              key={i.id}
              title={`${i.number} · ${formatMoney(i.total_cents, i.currency)}`}
              subtitle={`${invoiceStatusLabel(i, today)} · ${i.issue_date}`}
              onPress={() => router.push(`/invoices/${i.id}`)}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}
