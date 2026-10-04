import { expect, test } from '@playwright/test';
import { pasteIntoEditor, signIn } from './helpers';

test('sign up with a magic link lands on an empty Today', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Nothing due today')).toBeVisible();
  await expect(page.getByTestId('capture-button')).toBeVisible();
});

test('create a task for today and complete it (optimistic, persisted)', async ({ page }) => {
  await signIn(page);
  const input = page.getByTestId('quick-add-task');
  await input.fill('Send invoice to Acme');
  await input.press('Enter');

  const row = page.getByRole('button', { name: /^Send invoice to Acme/ });
  await expect(row).toBeVisible();
  await page.getByRole('checkbox', { name: 'Complete Send invoice to Acme' }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete Send invoice to Acme' })).toBeChecked();

  // Survives a reload: the write reached the server.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Complete Send invoice to Acme' })).toBeChecked();
});

test('paste a list into quick add to create one task per line', async ({ page }) => {
  await signIn(page);
  await page
    .getByTestId('quick-add-task')
    .fill('- Draft proposal\n- Book kickoff call\n- Send contract');
  await page.getByTestId('smart-paste-offer').click();
  await expect(page.getByRole('button', { name: /^Draft proposal/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Book kickoff call/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Send contract/ })).toBeVisible();
  await expect(page.getByTestId('quick-add-task')).toHaveValue('');
});

test('paste a list into a task to turn it into a checklist', async ({ page }) => {
  await signIn(page);
  await page.getByTestId('quick-add-task').fill('Launch website');
  await page.getByTestId('quick-add-task').press('Enter');
  await page.getByRole('button', { name: /^Launch website/ }).click();

  await page.getByTestId('add-subtask').fill('1. Hero section\n2. Pricing table\n3. [x] Footer');
  await expect(page.getByTestId('smart-paste-offer')).toHaveText(/3 items/);
  await page.getByTestId('smart-paste-offer').click();

  await expect(page.getByText('Hero section')).toBeVisible();
  await expect(page.getByText('Pricing table')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Complete Footer' })).toBeChecked();
  await expect(page.getByText('Checklist · 1/3')).toBeVisible();
});

test('client → note: paste a list in the editor and convert it', async ({ page }) => {
  await signIn(page);
  await page.getByRole('tab', { name: /Clients/ }).click();
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByTestId('client-name').fill('Acme Co');
  await page.getByTestId('save-client').click();
  await expect(page.getByLabel('Client name')).toHaveValue('Acme Co');

  await page.getByRole('button', { name: 'New note' }).click();
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await pasteIntoEditor(page, 'milk\neggs\nbread');
  await page.getByTestId('smart-paste-offer').click();
  await expect(page.locator('.ProseMirror ul[data-type="taskList"] li')).toHaveCount(3);

  // Formatting via the toolbar.
  await editor.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.keyboard.type('Important');
  await expect(page.locator('.ProseMirror strong')).toHaveText('Important');
});
