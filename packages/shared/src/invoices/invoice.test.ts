import { describe, expect, it } from 'vitest';
import {
  defaultDueDate,
  formatMoney,
  formatQuantity,
  invoiceTotal,
  isInvoiceOverdue,
  lineAmount,
  linesFromTime,
  minutesToHours,
  parseMoney,
  parseQuantity,
  renderInvoiceText,
  unbilledEntries,
  type BillableEntry,
} from './invoice.ts';

const entry = (over: Partial<BillableEntry>): BillableEntry => ({
  id: 'e',
  task_id: null,
  project_id: null,
  started_at: '2026-10-01T09:00:00Z',
  ended_at: '2026-10-01T10:00:00Z',
  minutes: 60,
  billable: true,
  invoice_id: null,
  ...over,
});

const tasks = [
  { id: 't1', title: 'Design homepage', client_id: 'acme', project_id: null },
  { id: 't2', title: 'Logo', client_id: null, project_id: 'p1' },
  { id: 't3', title: 'Other client work', client_id: 'globex', project_id: null },
];
const projects = [{ id: 'p1', title: 'Rebrand', client_id: 'acme' }];

describe('unbilledEntries', () => {
  it('keeps finished, billable, uninvoiced time for the client (via task or project)', () => {
    const entries = [
      entry({ id: 'a', task_id: 't1' }),
      entry({ id: 'b', task_id: 't2' }),
      entry({ id: 'c', project_id: 'p1' }),
      entry({ id: 'd', task_id: 't3' }),
      entry({ id: 'e', task_id: 't1', billable: false }),
      entry({ id: 'f', task_id: 't1', invoice_id: 'inv' }),
      entry({ id: 'g', task_id: 't1', ended_at: null, minutes: null }),
    ];
    expect(unbilledEntries(entries, 'acme', tasks, projects).map((e) => e.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('linesFromTime', () => {
  let n = 0;
  const id = () => `00000000-0000-4000-8000-00000000000${n++}`;

  it('groups by task, then project, then "Other work", ordered by first tracked time', () => {
    const lines = linesFromTime(
      [
        entry({ task_id: 't1', minutes: 90, started_at: '2026-10-02T09:00:00Z' }),
        entry({ task_id: 't1', minutes: 45, started_at: '2026-10-03T09:00:00Z' }),
        entry({ project_id: 'p1', minutes: 30, started_at: '2026-10-01T09:00:00Z' }),
        entry({ minutes: 20, started_at: '2026-10-04T09:00:00Z' }),
      ],
      tasks,
      projects,
      10000,
      id,
    );
    expect(lines.map((l) => [l.description, l.quantity, l.task_id])).toEqual([
      ['Rebrand', 0.5, null],
      ['Design homepage', 2.25, 't1'],
      ['Other work', 0.33, null],
    ]);
    expect(lines.every((l) => l.unit_price_cents === 10000)).toBe(true);
  });
});

describe('money', () => {
  it('computes amounts and totals in cents', () => {
    expect(minutesToHours(100)).toBe(1.67);
    expect(lineAmount(2.25, 10000)).toBe(22500);
    expect(lineAmount(0.33, 9999)).toBe(3300);
    expect(
      invoiceTotal([
        { quantity: 2.5, unit_price_cents: 10000 },
        { quantity: 1, unit_price_cents: 2550 },
      ]),
    ).toBe(27550);
  });

  it('formats and parses money', () => {
    expect(formatMoney(123450, 'USD')).toBe('$1,234.50');
    expect(formatMoney(5000, 'EUR')).toBe('€50.00');
    expect(formatMoney(5000, 'ZZZ1')).toBe('ZZZ1 50.00');
    expect(parseMoney('120')).toBe(12000);
    expect(parseMoney('$1,200.50')).toBe(120050);
    expect(parseMoney('85,50')).toBe(8550);
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.234')).toBeNull();
  });

  it('parses and formats quantities', () => {
    expect(parseQuantity('2,5')).toBe(2.5);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('x')).toBeNull();
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(2.5)).toBe('2.5');
    expect(formatQuantity(2.25)).toBe('2.25');
  });
});

describe('dates and status', () => {
  it('defaults to 14-day terms', () => {
    expect(defaultDueDate('2026-10-25')).toBe('2026-11-08');
  });
  it('only sent invoices past their due date are overdue', () => {
    expect(isInvoiceOverdue({ status: 'sent', due_date: '2026-10-03' }, '2026-10-04')).toBe(true);
    expect(isInvoiceOverdue({ status: 'sent', due_date: '2026-10-04' }, '2026-10-04')).toBe(false);
    expect(isInvoiceOverdue({ status: 'paid', due_date: '2026-10-01' }, '2026-10-04')).toBe(false);
    expect(isInvoiceOverdue({ status: 'sent', due_date: null }, '2026-10-04')).toBe(false);
  });
});

describe('renderInvoiceText', () => {
  it('renders a shareable invoice', () => {
    expect(
      renderInvoiceText({
        number: 'INV-0001',
        issue_date: '2026-10-04',
        due_date: '2026-10-18',
        currency: 'USD',
        client_name: 'Acme',
        notes: 'Thanks!',
        from: 'Sam Rivera',
        details: 'Pay to: IBAN XX00',
        lines: [
          { description: 'Design homepage', quantity: 2.5, unit_price_cents: 10000 },
          { description: 'Hosting', quantity: 1, unit_price_cents: 2550 },
        ],
      }),
    ).toBe(
      [
        'Invoice INV-0001',
        'From: Sam Rivera',
        'To: Acme',
        'Date: 2026-10-04',
        'Due: 2026-10-18',
        '',
        'Design homepage — 2.5 × $100.00 = $250.00',
        'Hosting — 1 × $25.50 = $25.50',
        '',
        'Total: $275.50',
        '',
        'Thanks!',
        '',
        'Pay to: IBAN XX00',
      ].join('\n'),
    );
  });
});
