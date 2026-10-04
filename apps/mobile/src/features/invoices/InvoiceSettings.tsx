import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SectionHeader, Text, TextField } from '@/components/ui';
import type { Me } from '@/features/auth/useMe';
import { useUpdateInvoiceSettings } from './api';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'] as const;

/** Settings → Invoices: currency and the details printed on every invoice. */
export function InvoiceSettings({ workspace }: { workspace: Me['workspace'] }) {
  const update = useUpdateInvoiceSettings();
  const [details, setDetails] = useState<string | null>(null);
  const currencies = CURRENCIES.includes(workspace.currency as (typeof CURRENCIES)[number])
    ? CURRENCIES
    : [workspace.currency, ...CURRENCIES];

  return (
    <>
      <SectionHeader title="Invoices" />
      <View className="gap-3 px-4">
        <View className="flex-row flex-wrap gap-2" accessibilityLabel="Invoice currency">
          {currencies.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              aria-checked={workspace.currency === c}
              accessibilityLabel={`Currency ${c}`}
              onPress={() => void update({ currency: c })}
              className={`min-h-[36px] justify-center rounded-full px-4 ${workspace.currency === c ? 'bg-accent' : 'bg-surface-2'}`}
            >
              <Text
                variant="caption"
                className={workspace.currency === c ? 'text-on-accent' : 'text-text'}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextField
          testID="invoice-details"
          label="Business details and payment instructions"
          value={details ?? workspace.invoice_details ?? ''}
          onChangeText={setDetails}
          onBlur={() =>
            details != null &&
            details !== workspace.invoice_details &&
            void update({ invoice_details: details.trim() || null })
          }
          placeholder={'Jordan Lee Design\n12 High St, London\nPay to: IBAN GB00 0000 0000'}
          multiline
          maxLength={2000}
          className="min-h-[96px]"
        />
        <Text variant="caption">Printed at the bottom of every invoice you share.</Text>
      </View>
    </>
  );
}
