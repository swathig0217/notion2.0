import { isInvoiceOverdue, type InvoiceStatus } from '@notion2/shared';

const LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  void: 'Void',
};

export function invoiceStatusLabel(
  invoice: { status: InvoiceStatus; due_date: string | null },
  today: string,
): string {
  return isInvoiceOverdue(invoice, today) ? 'Overdue' : LABELS[invoice.status];
}
