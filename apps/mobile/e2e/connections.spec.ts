// Phase 6: calendar feed and webhooks. Needs `pnpm functions:serve`
// (WEBHOOKS_ALLOW_INSECURE=1, CRON_SECRET=local-cron-secret).
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const API_URL = process.env.SUPABASE_API_URL ?? 'http://127.0.0.1:54321';
const CRON_SECRET = process.env.CRON_SECRET ?? 'local-cron-secret';
const RECEIVER_PORT = 4012;

interface Received {
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function startReceiver(): Promise<{ server: Server; received: Received[] }> {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(200).end('ok');
    });
  });
  return new Promise((resolve) =>
    server.listen(RECEIVER_PORT, '0.0.0.0', () => resolve({ server, received })),
  );
}

test('calendar feed: on, lists due dates, off', async ({ page, request }) => {
  await signIn(page);
  await page.getByTestId('quick-add-task').fill('Send proposal, v2');
  await page.getByTestId('quick-add-task').press('Enter');
  await expect(page.getByRole('button', { name: /^Send proposal, v2/ })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /Calendar and webhooks/ }).click();
  await page.getByTestId('calendar-on').click();
  const url = (await page.getByTestId('calendar-url').textContent())?.trim() ?? '';
  expect(url).toMatch(/\/functions\/v1\/calendar\?token=[a-f0-9]{32}$/);

  await expect.poll(async () => (await request.get(url)).status(), { timeout: 10_000 }).toBe(200);
  const res = await request.get(url);
  expect(res.headers()['content-type']).toContain('text/calendar');
  const ics = await res.text();
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('SUMMARY:Send proposal\\, v2');

  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('calendar-off').click();
  await expect(page.getByTestId('calendar-on')).toBeVisible();
  await expect.poll(async () => (await request.get(url)).status(), { timeout: 10_000 }).toBe(404);
});

test('webhooks: signed task.completed and test events are delivered', async ({ page, request }) => {
  const { server, received } = await startReceiver();
  try {
    await signIn(page);
    await page.getByTestId('quick-add-task').fill('Ship the logo');
    await page.getByTestId('quick-add-task').press('Enter');
    await expect(page.getByRole('button', { name: /^Ship the logo/ })).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /Calendar and webhooks/ }).click();
    await page.getByTestId('add-webhook').click();
    await page.getByTestId('webhook-url').fill(`http://host.docker.internal:${RECEIVER_PORT}/hook`);
    await page.getByTestId('save-webhook').click();
    await expect(page.getByTestId('webhook-detail-url')).toContainText(':4012/hook');
    await page.getByRole('button', { name: 'Show signing secret' }).click();
    const secret = (await page.getByText(/^[a-f0-9]{64}$/).textContent())?.trim() ?? '';
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    await page.waitForTimeout(500); // webhook insert lands before the task changes

    // Complete the task from Today, then run the delivery job (cron calls this every minute).
    await page.goto('/');
    await page.getByRole('checkbox', { name: 'Complete Ship the logo' }).click();
    await page.waitForTimeout(800);
    const deliver = () =>
      request.post(`${API_URL}/functions/v1/deliver-webhooks`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
    await expect
      .poll(
        async () => {
          await deliver();
          return received.length;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    const hit = received.find((r) => r.headers['notion2-event'] === 'task.completed');
    expect(hit).toBeDefined();
    const payload = JSON.parse(hit?.body ?? '{}') as {
      id: string;
      event: string;
      data: { title: string };
    };
    expect(payload.event).toBe('task.completed');
    expect(payload.data.title).toBe('Ship the logo');
    expect(payload.id).toBe(hit?.headers['notion2-delivery']);
    const [t, v1] = String(hit?.headers['notion2-signature'])
      .split(',')
      .map((p) => p.split('=')[1]);
    expect(v1).toBe(createHmac('sha256', secret).update(`${t}.${hit?.body}`).digest('hex'));
    expect(received.some((r) => r.headers['notion2-event'] === 'task.created')).toBe(false); // not subscribed

    // Test event from the webhook screen, visible in its delivery log.
    await page.goBack();
    await expect(page.getByTestId('webhook-detail-url')).toBeVisible();
    await page.getByTestId('webhook-test').click();
    await expect
      .poll(
        async () => {
          await deliver();
          return received.some((r) => r.headers['notion2-event'] === 'ping');
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await expect(page.getByTestId('delivery-ping')).toContainText('Delivered · 200', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('delivery-task.completed')).toContainText('Delivered');
  } finally {
    server.close();
  }
});
