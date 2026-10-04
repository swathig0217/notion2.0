// Phase 5: read-only client view. Needs `pnpm functions:serve` (the public `client-view`
// function) like the other AI specs.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('share a project with a client: hide a task, open signed out, turn off', async ({
  page,
  browser,
}) => {
  await signIn(page);
  await page.getByRole('tab', { name: /Clients/ }).click();
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByTestId('client-name').fill('Acme');
  await page.getByTestId('save-client').click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByTestId('project-title').fill('Rebrand');
  await page.getByRole('button', { name: 'Create project' }).click();

  const add = page.getByLabel('Add a task', { exact: true }).last(); // client page stays mounted below
  for (const title of ['Logo concepts', 'Website', 'Private: chase payment']) {
    await add.fill(title);
    await add.press('Enter');
    await expect(page.getByRole('button', { name: new RegExp(`^${title}`) })).toBeVisible();
  }
  await page.getByRole('checkbox', { name: 'Complete Logo concepts' }).click();

  await page.getByTestId('share-with-client').click();
  const url = (await page.getByTestId('share-url').textContent())?.trim() ?? '';
  expect(url).toMatch(/\/p\/[a-f0-9]{32}$/);
  await page.getByRole('checkbox', { name: 'Show “Private: chase payment” to the client' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Show “Private: chase payment” to the client' }),
  ).toHaveAttribute('aria-checked', 'false');
  await page.waitForTimeout(500); // let the queued writes land

  // The client: a fresh browser with no session.
  const guest = await browser.newContext();
  const client = await guest.newPage();
  await client.goto(url);
  await expect(client.getByTestId('client-view-title')).toHaveText('Rebrand', { timeout: 15_000 });
  await expect(client.getByText('Website')).toBeVisible();
  await expect(client.getByText('Logo concepts')).toBeVisible();
  await expect(client.getByTestId('client-view-progress')).toHaveText('1 of 2 done');
  await expect(client.getByText('Private: chase payment')).toHaveCount(0);
  await expect(client.getByText('Acme')).toBeVisible();

  // The freelancer sees the visit, then turns the link off.
  await page.evaluate(() => localStorage.removeItem('notion2-cache-v1'));
  await page.reload();
  await expect(page.getByText(/Opened 1 time/)).toBeVisible({ timeout: 15_000 });
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('share-turn-off').click();
  await expect(page.getByTestId('share-with-client')).toBeVisible();
  await page.waitForTimeout(500);

  await client.reload();
  await expect(client.getByText('This link isn’t active')).toBeVisible({ timeout: 15_000 });
  await guest.close();
});
