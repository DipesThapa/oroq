import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';

// The Durable Object class is exported as a named export.
// We exercise it through the bound `STATS_DO` namespace declared in
// wrangler.toml (which vitest.config.js wires through).

describe('StatsCounter', () => {
  let id;
  let stub;
  let counter = 0;

  beforeEach(() => {
    // Unique name per test so state does not bleed across tests
    // (we run with isolatedStorage: false for framework stability).
    counter += 1;
    id = env.STATS_DO.idFromName(`test-${counter}-${Math.random()}`);
    stub = env.STATS_DO.get(id);
  });

  it('increments queries counter', async () => {
    const r1 = await stub.fetch('https://do/incr?type=queries', { method: 'POST' });
    expect(await r1.text()).toBe('1');
    const r2 = await stub.fetch('https://do/incr?type=queries', { method: 'POST' });
    expect(await r2.text()).toBe('2');
  });

  it('increments blocks counter independently', async () => {
    await stub.fetch('https://do/incr?type=queries', { method: 'POST' });
    const r = await stub.fetch('https://do/incr?type=blocks', { method: 'POST' });
    expect(await r.text()).toBe('1');
  });

  it('records unique installs by hash', async () => {
    await stub.fetch('https://do/install?hash=abc', { method: 'POST' });
    await stub.fetch('https://do/install?hash=abc', { method: 'POST' });
    await stub.fetch('https://do/install?hash=def', { method: 'POST' });
    const snap = await stub.fetch('https://do/snapshot');
    const data = await snap.json();
    expect(data.installs).toBe(2);
  });

  it('snapshot returns all counters', async () => {
    await stub.fetch('https://do/incr?type=queries', { method: 'POST' });
    await stub.fetch('https://do/incr?type=blocks', { method: 'POST' });
    await stub.fetch('https://do/install?hash=h1', { method: 'POST' });
    const snap = await stub.fetch('https://do/snapshot');
    const data = await snap.json();
    expect(data).toEqual({ queries: 1, blocks: 1, installs: 1 });
  });

  it('rejects unknown counter type', async () => {
    const r = await stub.fetch('https://do/incr?type=bogus', { method: 'POST' });
    expect(r.status).toBe(400);
  });

  it('rejects missing hash on install', async () => {
    const r = await stub.fetch('https://do/install', { method: 'POST' });
    expect(r.status).toBe(400);
  });
});
