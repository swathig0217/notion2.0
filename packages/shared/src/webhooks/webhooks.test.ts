// Test-only: compares against Node's HMAC.
/// <reference types="node" />
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  retryDelaySeconds,
  signWebhook,
  webhookSecretFromBytes,
  webhookUrlProblem,
} from './webhooks.ts';

describe('webhookUrlProblem', () => {
  it('accepts public https endpoints', () => {
    expect(webhookUrlProblem('https://hooks.zapier.com/hooks/catch/1/abc/')).toBeNull();
    expect(webhookUrlProblem('https://hook.eu1.make.com/xyz')).toBeNull();
  });
  it('rejects http, credentials, and private or local hosts', () => {
    expect(webhookUrlProblem('http://example.com')).toMatch(/https/);
    expect(webhookUrlProblem('https://user:pw@example.com')).toMatch(/password/);
    for (const host of [
      'localhost',
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.4',
      '172.20.0.1',
      '169.254.169.254',
      '[::1]',
      'printer.local',
      'db.internal',
    ]) {
      expect(webhookUrlProblem(`https://${host}/x`), host).toMatch(/public/);
    }
    expect(webhookUrlProblem('not a url')).toMatch(/full URL/);
  });
  it('allows local http only when explicitly insecure (dev/e2e)', () => {
    expect(
      webhookUrlProblem('http://host.docker.internal:4012/hook', { allowInsecure: true }),
    ).toBeNull();
    expect(webhookUrlProblem('ftp://x', { allowInsecure: true })).toMatch(/https/);
  });
});

describe('signing', () => {
  it('matches a standard HMAC-SHA256 over "<t>.<body>"', async () => {
    const secret = 'ab'.repeat(32);
    const body = '{"event":"ping"}';
    const expected = createHmac('sha256', secret).update(`1791100000.${body}`).digest('hex');
    expect(await signWebhook(secret, 1791100000, body)).toBe(`t=1791100000,v1=${expected}`);
  });
  it('makes 64-hex secrets', () => {
    expect(webhookSecretFromBytes(new Uint8Array(32).fill(1))).toBe('01'.repeat(32));
    expect(() => webhookSecretFromBytes(new Uint8Array(16))).toThrow();
  });
});

describe('retries', () => {
  it('backs off, then gives up after 5 attempts', () => {
    expect([1, 2, 3, 4, 5].map(retryDelaySeconds)).toEqual([60, 300, 1800, 7200, null]);
  });
});
