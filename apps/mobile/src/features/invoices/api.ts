import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoiceTotal, lineAmount, type InvoiceLine, type Tables } from '@notion2/shared';
import { keys, updateList, useDbWrite, useDbWriteAsync } from '@/lib/collection';
import { supabase } from '@/lib/supabase';
import { useTrack } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import type { Me } from '@/features/auth/useMe';
import type { TimeEntry } from '@/features/time/api';

export type Invoice = Tables<'invoices'>;
export type InvoiceItem = Tables<'invoice_items'>;

/** Shown until the server assigns the number (first save, possibly after reconnect). */
export const PENDING_NUMBER = 'Draft';

export function useInvoices() {
  return useQuery({
    queryKey: keys.invoices,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useInvoice(id: string | undefined) {
  const { data, ...rest } = useInvoices();
  return { ...rest, data: useMemo(() => data?.find((i) => i.id === id), [data, id]) };
}

export function useInvoiceItems(invoiceId: string | undefined) {
  return useQuery({
    queryKey: keys.invoiceItems(invoiceId ?? ''),
    enabled: invoiceId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId ?? '')
        .order('position');
      if (error) throw error;
      return data;
    },
  });
}

export interface InvoiceDraft {
  id: string;
  workspace_id: string;
  client_id: string | null;
  client_name: string;
  client_email: string | null;
  issue_date: string;
  due_date: string | null;
  currency: string;
  notes: string | null;
}

/**
 * Creates or updates a draft invoice. Optimistic: the invoice, its lines and the billed
 * time update in the cache at once; `save_invoice` (atomic, idempotent) is queued and
 * assigns the number on first save.
 */
export function useSaveInvoice() {
  const qc = useQueryClient();
  const write = useDbWriteAsync();
  const track = useTrack();
  return useCallback(
    async (draft: InvoiceDraft, lines: InvoiceLine[], timeEntryIds: string[]) => {
      const now = new Date().toISOString();
      const existing = qc.getQueryData<Invoice[]>(keys.invoices)?.find((i) => i.id === draft.id);
      const row: Invoice = {
        number: PENDING_NUMBER,
        status: 'draft',
        sent_at: null,
        paid_at: null,
        created_at: now,
        ...existing,
        ...draft,
        total_cents: invoiceTotal(lines),
        updated_at: now,
      };
      updateList<Invoice>(qc, keys.invoices, (rows) =>
        existing ? rows.map((r) => (r.id === row.id ? row : r)) : [row, ...rows],
      );
      qc.setQueryData<InvoiceItem[]>(
        keys.invoiceItems(draft.id),
        lines.map((l, position) => ({
          ...l,
          workspace_id: draft.workspace_id,
          invoice_id: draft.id,
          position,
          amount_cents: lineAmount(l.quantity, l.unit_price_cents),
          created_at: now,
        })),
      );
      const billed = new Set(timeEntryIds);
      updateList<TimeEntry>(qc, keys.time, (rows) =>
        rows.map((e) =>
          billed.has(e.id)
            ? { ...e, invoice_id: draft.id }
            : e.invoice_id === draft.id
              ? { ...e, invoice_id: null }
              : e,
        ),
      );
      if (!existing) track('invoice_created', { lines: lines.length, from_time: billed.size > 0 });
      const saved = write({
        op: 'rpc',
        table: 'invoices',
        fn: 'save_invoice',
        args: {
          p_invoice: draft,
          p_items: lines.map(({ id, description, quantity, unit_price_cents, task_id }) => ({
            id,
            description,
            quantity,
            unit_price_cents,
            task_id,
          })),
          p_time_entry_ids: timeEntryIds,
        },
      });
      // The number comes from the server; refresh once the save lands.
      void saved.then(() => qc.invalidateQueries({ queryKey: keys.invoices })).catch(() => {});
      return row;
    },
    [qc, write, track],
  );
}

export function useSetInvoiceStatus() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const track = useTrack();
  return useCallback(
    (invoice: Invoice, status: 'sent' | 'paid' | 'void') => {
      const now = new Date().toISOString();
      const patch = {
        status,
        ...(status === 'sent' && !invoice.sent_at ? { sent_at: now } : {}),
        ...(status === 'paid' ? { paid_at: now } : {}),
      };
      updateList<Invoice>(qc, keys.invoices, (rows) =>
        rows.map((r) => (r.id === invoice.id ? { ...r, ...patch } : r)),
      );
      write({ op: 'update', table: 'invoices', id: invoice.id, patch });
      if (status === 'sent') track('invoice_sent');
      if (status === 'paid') track('invoice_paid');
    },
    [qc, write, track],
  );
}

/** Deletes a draft; its time is released for the next invoice. */
export function useDeleteInvoice() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (invoice: Invoice) => {
      updateList<Invoice>(qc, keys.invoices, (rows) => rows.filter((r) => r.id !== invoice.id));
      updateList<TimeEntry>(qc, keys.time, (rows) =>
        rows.map((e) => (e.invoice_id === invoice.id ? { ...e, invoice_id: null } : e)),
      );
      write({ op: 'delete', table: 'invoices', ids: [invoice.id] });
      toast.show('Draft invoice deleted');
    },
    [qc, write],
  );
}

type WorkspacePatch = Partial<Pick<Me['workspace'], 'currency' | 'invoice_details'>>;

/** Owner-only workspace settings for invoices (optimistic, reverts on rejection). */
export function useUpdateInvoiceSettings() {
  const qc = useQueryClient();
  return useCallback(
    async (patch: WorkspacePatch) => {
      const before = qc.getQueryData<Me>(keys.me);
      if (!before) return false;
      qc.setQueryData<Me>(keys.me, { ...before, workspace: { ...before.workspace, ...patch } });
      const { error } = await supabase
        .from('workspaces')
        .update(patch)
        .eq('id', before.workspace.id);
      if (error) {
        qc.setQueryData<Me>(keys.me, before);
        toast.error('Couldn’t save that setting.');
        return false;
      }
      return true;
    },
    [qc],
  );
}
