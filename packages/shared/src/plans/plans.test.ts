// Test-only: reads the SQL migrations from disk (the module itself stays runtime-agnostic).
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FREE_LIMITS,
  METERED_AI_TYPES,
  Usage,
  aiActionsLeft,
  atClientLimit,
  isClientLimitError,
  isSampleClientName,
  yearlySavingPct,
} from './plans.ts';

const migration = readFileSync(
  new URL('../../../../supabase/migrations/20261006000000_phase4_launch.sql', import.meta.url),
  'utf8',
);

const usage = (over: Partial<Usage> = {}): Usage => ({
  plan: 'free',
  active_clients: 1,
  client_limit: 3,
  ai_actions_used: 5,
  ai_action_limit: 30,
  period_start: '2026-10-01T00:00:00Z',
  ...over,
});

describe('plans', () => {
  it('mirrors the limits enforced by the database', () => {
    expect(migration).toContain(
      `{"free": {"active_clients": ${FREE_LIMITS.active_clients}, "ai_actions_per_month": ${FREE_LIMITS.ai_actions_per_month}}}`,
    );
    expect(migration).toContain(
      `select t in (${METERED_AI_TYPES.map((t) => `'${t}'`).join(', ')});`,
    );
  });

  it('knows sample clients', () => {
    expect(isSampleClientName('Northwind Bakery (sample)')).toBe(true);
    expect(isSampleClientName('Sample Co')).toBe(false);
    expect(isSampleClientName('(sample)')).toBe(false);
  });

  it('detects the client limit', () => {
    expect(atClientLimit(usage({ active_clients: 2 }))).toBe(false);
    expect(atClientLimit(usage({ active_clients: 3 }))).toBe(true);
    expect(atClientLimit(usage({ plan: 'pro', active_clients: 50, client_limit: null }))).toBe(
      false,
    );
    expect(atClientLimit(undefined)).toBe(false);
  });

  it('counts AI actions left', () => {
    expect(aiActionsLeft(usage())).toBe(25);
    expect(aiActionsLeft(usage({ ai_actions_used: 40 }))).toBe(0);
    expect(aiActionsLeft(usage({ ai_action_limit: null }))).toBeNull();
  });

  it('parses the usage RPC result', () => {
    expect(Usage.parse(usage())).toEqual(usage());
    expect(() => Usage.parse({ plan: 'gold' })).toThrow();
  });

  it('prices: yearly saves a third', () => {
    expect(yearlySavingPct()).toBe(33);
  });

  it('recognizes the database limit error', () => {
    expect(isClientLimitError(new Error('plan_limit_clients'))).toBe(true);
    expect(isClientLimitError(new Error('network'))).toBe(false);
  });
});
