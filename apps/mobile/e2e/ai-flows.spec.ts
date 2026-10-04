// AI flows run against the real `process-inbox` / `generate-workspace` edge functions with
// the deterministic mock model (AI_MOCK=1), so they need `pnpm functions:serve` running.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('onboarding: 3 questions -> reviewable starter workspace -> Today', async ({ page }) => {
  await signIn(page, undefined, { onboarding: 'stay' });

  await page.getByRole('radio', { name: 'Designer' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: '3-5' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: 'Invoicing and getting paid' }).click();
  await page.getByTestId('build-workspace').click();

  await expect(page.getByRole('heading', { name: 'Your starter workspace' })).toBeVisible({
    timeout: 15_000,
  });
  // Every proposed change is shown and can be excluded before anything is created.
  await page.getByRole('checkbox', { name: 'Include Bolt Fitness (sample)' }).click();
  await page.getByRole('button', { name: /Create my workspace/ }).click();

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText('Northwind Bakery (sample)', { exact: false }).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Kickoff call: goals and audience/ }),
  ).toBeVisible();

  await page.getByRole('tab', { name: /Clients/ }).click();
  await expect(page.getByRole('button', { name: /^Northwind Bakery \(sample\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Bolt Fitness \(sample\)/ })).toHaveCount(0);
});

test('dump -> proposal -> accept -> undo', async ({ page }) => {
  await signIn(page);

  // A client the assistant should match by name.
  await page.getByRole('tab', { name: /Clients/ }).click();
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByTestId('client-name').fill('Acme Co');
  await page.getByTestId('save-client').click();
  await expect(page.getByLabel('Client name')).toHaveValue('Acme Co');
  await page.goBack();

  // Dump it.
  await page.getByTestId('capture-button').click();
  await page.getByTestId('capture-input').fill('Acme needs:\n- new logo\n- send invoice tomorrow');
  await page.getByTestId('capture-save').click();

  // The proposal appears in the Inbox; nothing has changed yet.
  await page.getByRole('tab', { name: /Inbox/ }).click();
  await page.getByTestId('review-proposal').click({ timeout: 20_000 });
  await expect(page.getByTestId('proposal-summary')).toContainText('2 tasks for Acme Co');
  await expect(page.getByText('Task · Acme Co').first()).toBeVisible();

  // Edit one title, then accept.
  await page.getByLabel('Edit task title').first().fill('Design new logo');
  await page.getByTestId('accept-proposal').click();
  await expect(page.getByText('Added 2 items')).toBeVisible();

  await page.getByRole('tab', { name: /Clients/ }).click();
  await page.getByRole('button', { name: /^Acme Co/ }).click();
  await expect(page.getByRole('button', { name: /^Design new logo/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^send invoice tomorrow/ })).toBeVisible();
  await page.goBack();

  // Undo removes exactly what was added, and the dump returns to the Inbox.
  await page.getByRole('tab', { name: /Inbox/ }).click();
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(page.getByText('Undone')).toBeVisible();
  await expect(page.getByTestId('organize')).toBeVisible();

  await page.getByRole('tab', { name: /Clients/ }).click();
  await page.getByRole('button', { name: /^Acme Co/ }).click();
  await expect(page.getByRole('button', { name: /^Design new logo/ })).toHaveCount(0);
});
