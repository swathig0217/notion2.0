import { useLocalSearchParams } from 'expo-router';
import { ListSkeleton } from '@/components/ui';
import { useClient } from '@/features/clients/api';
import { useInvoice, useInvoiceItems } from '@/features/invoices/api';
import { InvoiceEditor } from '@/features/invoices/InvoiceEditor';
import { useProjects } from '@/features/projects/api';
import { useTasks } from '@/features/tasks/api';
import { useTimeEntries } from '@/features/time/api';

/** New invoice for a client (`clientId`), or edit a draft (`invoiceId`). */
export default function InvoiceEditScreen() {
  const params = useLocalSearchParams<{ clientId?: string; invoiceId?: string }>();
  const invoice = useInvoice(params.invoiceId);
  const items = useInvoiceItems(params.invoiceId);
  const client = useClient(params.clientId ?? invoice.data?.client_id ?? undefined);
  // Lines are built from tracked time once, so wait for it.
  const loading = [client, useTimeEntries(), useTasks(), useProjects()].some((q) => q.isPending);
  if (loading || (params.invoiceId && (invoice.isPending || items.isPending)))
    return <ListSkeleton />;
  return (
    <InvoiceEditor
      key={params.invoiceId ?? params.clientId}
      client={client.data}
      invoice={invoice.data}
      items={items.data}
    />
  );
}
