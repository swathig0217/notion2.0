import { expect, type Page } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@notion2.local`;
}

interface MailpitList {
  messages: { ID: string; To: { Address: string }[] }[];
}

/** Polls the local mail catcher for the newest magic link sent to `email`. */
export async function getMagicLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = (await (
      await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    ).json()) as MailpitList;
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
        HTML: string;
      };
      const match = /(http[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+)/.exec(msg.HTML || msg.Text);
      if (match?.[1]) return match[1].replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link email for ${email}`);
}

/** Signs up/in through the real UI and the emailed magic link. Ends on Today. */
export async function signIn(page: Page, email = uniqueEmail()) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByTestId('email-input').fill(email);
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  const link = await getMagicLink(email);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 20_000 });
  return email;
}

/** Fires a real paste event with plain text at the focused ProseMirror editor. */
export async function pasteIntoEditor(page: Page, text: string) {
  await page.locator('.ProseMirror').evaluate((el, t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}
