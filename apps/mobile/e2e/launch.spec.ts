// Phase 4 flows: plans and limits (billing stub), invoicing, data export. Needs
// `pnpm functions:serve` (AI_MOCK=1, BILLING_MODE=stub) like the other AI specs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './helpers';

const API_URL = process.env.SUPABASE_API_URL ?? 'http://127.0.0.1:54321';

/** Local stack only: the service key is the well-known local demo key from `supabase status`. */
function serviceKey(): string {
  const status = JSON.parse(
    execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      cwd: resolve(__dirname, '../../..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  ) as { SERVICE_ROLE_KEY: string };
  return status.SERVICE_ROLE_KEY;
}

async function workspaceId(page: Page, request: APIRequestContext, key: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const address = (await page.getByTestId('inbound-address').textContent())?.trim() ?? '';
  const token = address.split('@')[0];
  const res = await request.get(
    `${API_URL}/rest/v1/workspaces?inbound_token=eq.${token}&select=id`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
  );
  const rows = (await res.json()) as { id: string }[];
  await page.goBack();
  return rows[0]?.id ?? '';
}

async function addClient(page: Page, name: string) {
  await page.getByRole('tab', { name: /Clients/ }).click();
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByTestId('client-name').fill(name);
  await page.getByTestId('save-client').click();
}

test('free plan: 4th client opens the paywall; upgrading lifts the limit', async ({ page }) => {
  await signIn(page);
  for (const name of ['Acme', 'Globex', 'Initech']) {
    await addClient(page, name);
    await expect(page.getByLabel('Client name')).toHaveValue(name);
    await page.goBack();
  }
  await page.getByRole('tab', { name: /Today/ }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Active clients: 3 of 3')).toBeVisible();
  await page.goBack();
  await addClient(page, 'Umbrella');
  await expect(page.getByTestId('paywall-reason')).toContainText('3 active clients');

  await page.getByTestId('upgrade-pro').click();
  await expect(page.getByText('You’re on Pro. Thank you!')).toBeVisible();
  await page.getByTestId('save-client').click();
  await expect(page.getByLabel('Client name')).toHaveValue('Umbrella');

  await page.goBack();
  await page.getByRole('tab', { name: /Today/ }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('plan-name')).toContainText('Pro');
});

test('invoice from tracked time: draft, sent, paid, and time is locked', async ({
  page,
  request,
}) => {
  await signIn(page);
  const key = serviceKey();
  const ws = await workspaceId(page, request, key);
  await addClient(page, 'Acme');
  await page.getByLabel('Add a task', { exact: true }).fill('Design homepage');
  await page.getByLabel('Add a task', { exact: true }).press('Enter');
  await page.getByRole('button', { name: /^Design homepage/ }).click();
  await page.getByRole('button', { name: 'Add time' }).click();
  await page.getByTestId('manual-duration').fill('1h30');
  await page.getByTestId('manual-add').click();
  await expect(page.getByTestId('time-total')).toHaveText('1h 30m');
  await page.goBack();

  await expect(page.getByTestId('unbilled-time')).toContainText('1h 30m');
  await page.getByTestId('create-invoice').click();
  await expect(page.getByTestId('line-description-0')).toHaveValue('Design homepage');
  await expect(page.getByTestId('line-quantity-0')).toHaveValue('1.5');
  await page.getByTestId('invoice-rate').fill('100');
  await expect(page.getByTestId('invoice-total')).toHaveText('$150.00');
  await page.getByTestId('add-line').click();
  await page.getByTestId('line-description-1').fill('Hosting');
  await page.getByTestId('line-price-1').fill('25.50');
  await expect(page.getByTestId('invoice-total')).toHaveText('$175.50');
  await page.getByTestId('save-invoice').click();

  await expect(page.getByTestId('invoice-number')).toHaveText('INV-0001', { timeout: 15_000 });
  await expect(page.getByTestId('invoice-detail-total')).toHaveText('$175.50');
  await page.getByTestId('invoice-mark-sent').click();
  await expect(page.getByTestId('invoice-status')).toHaveText('Sent');

  // Due date in the past → it shows up under Today's unpaid invoices.
  await request.patch(`${API_URL}/rest/v1/invoices?workspace_id=eq.${ws}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    data: { issue_date: '2026-01-01', due_date: '2026-01-15' },
  });
  // Drop the persisted query cache (it is fresh for 30s) so Today refetches.
  await page.evaluate(() => localStorage.removeItem('notion2-cache-v1'));
  await page.goto('/');
  await expect(page.getByText('Unpaid invoices')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Acme · \$175\.50/ }).click();
  await expect(page.getByTestId('invoice-status')).toHaveText('Overdue');
  await page.getByTestId('invoice-mark-paid').click();
  await expect(page.getByTestId('invoice-status')).toHaveText('Paid');

  // The billed time is locked on the task.
  await page.goto('/');
  await page.getByRole('tab', { name: /Clients/ }).click();
  await page.getByRole('button', { name: /^Acme/ }).click();
  await expect(page.getByTestId('unbilled-time')).toHaveText('No unbilled time.');
});

test('free plan: AI limit keeps the dump and offers Pro', async ({ page, request }) => {
  await signIn(page);
  const key = serviceKey();
  const ws = await workspaceId(page, request, key);
  const rows = Array.from({ length: 30 }, () => ({ workspace_id: ws, type: 'process_inbox' }));
  const res = await request.post(`${API_URL}/rest/v1/ai_actions`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    data: rows,
  });
  expect(res.ok()).toBe(true);

  await page.getByTestId('capture-button').click();
  await page.getByTestId('capture-input').fill('Call Sam about the logo tomorrow');
  await page.getByTestId('capture-save').click();
  await page.getByRole('tab', { name: /Inbox/ }).click();
  await expect(page.getByText('Call Sam about the logo tomorrow')).toBeVisible();
  await expect(page.getByText('You’ve used this month’s AI actions on the free plan.')).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  await page.getByTestId('inbox-upgrade').click();
  await expect(page.getByTestId('paywall-reason')).toContainText('AI actions');
});

test('data export downloads everything as JSON', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('quick-add-task').fill('Send proposal');
  await page.getByTestId('quick-add-task').press('Enter');
  await expect(page.getByRole('button', { name: /^Send proposal/ })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-data').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^notion2-export-\d{4}-\d{2}-\d{2}\.json$/);
  const bundle = JSON.parse(readFileSync((await file.path()) ?? '', 'utf8')) as {
    format: string;
    tables: Record<string, { title?: string }[]>;
  };
  expect(bundle.format).toBe('notion2-export');
  expect(bundle.tables.tasks?.map((t) => t.title)).toContain('Send proposal');
  expect(bundle.tables.workspaces).toHaveLength(1);
  expect(Object.keys(bundle.tables)).toContain('invoices');
});
