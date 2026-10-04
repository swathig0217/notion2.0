// Phase 3 flows. AI features run against the real edge functions with the mock model
// (AI_MOCK=1), so `pnpm functions:serve` must be running.
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { signIn } from './helpers';

const API_URL = process.env.SUPABASE_API_URL ?? 'http://127.0.0.1:54321';
const INBOUND_SECRET = process.env.INBOUND_WEBHOOK_SECRET ?? 'local-inbound-secret';

async function addClient(page: Page, name: string, email?: string) {
  await page.getByRole('tab', { name: /Clients/ }).click();
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByTestId('client-name').fill(name);
  if (email) await page.getByLabel('Email (optional)').fill(email);
  await page.getByTestId('save-client').click();
  await expect(page.getByLabel('Client name')).toHaveValue(name);
}

test('time tracking: timer and manual entries', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('quick-add-task').fill('Design homepage');
  await page.getByTestId('quick-add-task').press('Enter');
  await page.getByRole('button', { name: /^Design homepage/ }).click();

  await page.getByTestId('timer-start').click();
  await expect(page.getByTestId('timer-stop')).toContainText(/Stop 0:0[0-9]/);
  await page.waitForTimeout(1500);
  await page.getByTestId('timer-stop').click();
  await expect(page.getByTestId('timer-start')).toBeVisible();

  await page.getByRole('button', { name: 'Add time' }).click();
  await page.getByTestId('manual-duration').fill('1h30');
  await page.getByTestId('manual-add').click();
  await expect(page.getByTestId('time-total')).toHaveText('1h 30m');

  await page.getByRole('button', { name: 'Delete 1h 30m entry' }).click();
  await expect(page.getByText('Time entry deleted')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('time-total')).toHaveText('1h 30m');
});

test('client update writer: draft, edit, mark as sent', async ({ page }) => {
  await signIn(page);
  await addClient(page, 'Acme Co', 'sam@acme.example');
  // The client page's own quick add (Today's stays mounted underneath).
  const quickAdd = page.getByLabel('Add a task', { exact: true });
  await quickAdd.fill('Homepage mockups');
  await quickAdd.press('Enter');
  await page.getByRole('checkbox', { name: 'Complete Homepage mockups' }).click();

  await page.getByTestId('write-update').click();
  await expect(page.getByTestId('draft-body')).toHaveValue(/Hi Sam,/, { timeout: 15_000 });
  await expect(page.getByTestId('draft-body')).toHaveValue(/Homepage mockups/);
  await page.getByTestId('draft-body').fill('Hi Sam,\n\nMockups are done.\n\nBest');
  await page.getByTestId('draft-mark-sent').click();
  await expect(page.getByText('Marked Acme Co as contacted')).toBeVisible();
  await expect(page.getByText(/Last contact: (?!never)/)).toBeVisible();
});

test('weekly brief: priorities from real tasks, one tap to open', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('quick-add-task').fill('Send invoice to Acme');
  await page.getByTestId('quick-add-task').press('Enter');
  await expect(page.getByRole('button', { name: /^Send invoice to Acme/ })).toBeVisible();

  await page.getByRole('tab', { name: /Brief/ }).click();
  await expect(page.getByTestId('brief-headline')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('brief-priority-0')).toContainText('Send invoice to Acme');
  await page.getByTestId('brief-priority-0').click();
  await expect(page.getByTestId('task-title')).toHaveValue('Send invoice to Acme');
});

test('forwarded email lands in the Inbox, organized', async ({ page, request }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const address = (await page.getByTestId('inbound-address').textContent())?.trim() ?? '';
  expect(address).toMatch(/^[a-f0-9]{16}@in\.notion2\.test$/);

  const res = await request.post(`${API_URL}/functions/v1/inbound-email`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`postmark:${INBOUND_SECRET}`).toString('base64')}`,
    },
    data: {
      From: 'sam@acme.example',
      FromFull: { Email: 'sam@acme.example', Name: 'Sam' },
      OriginalRecipient: address,
      Subject: 'Next steps',
      TextBody: 'Hi! Could you send the final logo files?',
      Headers: [],
    },
  });
  expect(res.ok()).toBe(true);

  await page.goBack();
  await page.getByRole('tab', { name: /Inbox/ }).click();
  await expect(page.getByText('Subject: Next steps', { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('review-proposal')).toBeVisible({ timeout: 15_000 });
});

test('screenshot capture is uploaded and organized', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('capture-button').click();
  await page.getByRole('radio', { name: 'Screenshot' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('pick-image').click();
  await (await chooser).setFiles(join(__dirname, 'fixtures', 'screenshot.png'));
  await expect(page.getByLabel('Selected screenshot')).toBeVisible();
  await page.getByLabel('Note about the image').fill('Chat with Sam about the launch');
  await page.getByTestId('capture-save-image').click();

  await page.getByRole('tab', { name: /Inbox/ }).click();
  await expect(page.getByText('Chat with Sam about the launch')).toBeVisible();
  await expect(page.getByTestId('review-proposal')).toBeVisible({ timeout: 15_000 });
});
