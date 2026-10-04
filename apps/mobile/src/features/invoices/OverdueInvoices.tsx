import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { daysBetween, formatMoney, isInvoiceOverdue } from '@notion2/shared';
import { ListRow, SectionHeader } from '@/components/ui';
import { useInvoices } from './api';

/** Today: sent invoices past their due date ("chasing invoices" admin). */
export function OverdueInvoices({ today }: { today: string }) {
  const invoices = useInvoices().data;
  const overdue = useMemo(
    () =>
      (invoices ?? [])
        .filter((i) => isInvoiceOverdue(i, today))
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
    [invoices, today],
  );
  if (overdue.length === 0) return null;
  return (
    <View>
      <SectionHeader title="Unpaid invoices" />
      <View className="gap-px bg-border">
        {overdue.map((i) => (
          <ListRow
            key={i.id}
            title={`${i.client_name} · ${formatMoney(i.total_cents, i.currency)}`}
            subtitle={`${i.number} · ${daysBetween(i.due_date ?? today, today)} days overdue`}
            onPress={() => router.push(`/invoices/${i.id}`)}
          />
        ))}
      </View>
    </View>
  );
}
