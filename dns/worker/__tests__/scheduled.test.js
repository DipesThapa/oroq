import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { env } from 'cloudflare:test';

describe('scheduled (daily cron)', () => {
  beforeEach(async () => {
    await env.BLOCKLIST_KV.delete('meta:dailysalt');
  });

  it('rotates the daily salt', async () => {
    await worker.scheduled({ scheduledTime: Date.now() }, env, { waitUntil: () => {} });
    const salt = await env.BLOCKLIST_KV.get('meta:dailysalt');
    expect(salt).toBeTruthy();
    expect(salt.length).toBeGreaterThanOrEqual(16);
  });

  it('replaces an existing salt with a new value', async () => {
    await env.BLOCKLIST_KV.put('meta:dailysalt', 'old-salt-value');
    await worker.scheduled({ scheduledTime: Date.now() }, env, { waitUntil: () => {} });
    const salt = await env.BLOCKLIST_KV.get('meta:dailysalt');
    expect(salt).not.toBe('old-salt-value');
  });

  it('writes a per-level stats summary key for yesterday', async () => {
    // Seed a DO with some counts as if traffic happened yesterday.
    const yesterday = new Date(Date.now() - 86_400_000);
    const y = yesterday.getUTCFullYear();
    const m = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
    const d = String(yesterday.getUTCDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;

    const id = env.STATS_DO.idFromName(`kids:${key}`);
    const stub = env.STATS_DO.get(id);
    await stub.fetch('https://do/incr?type=queries', { method: 'POST' });
    await stub.fetch('https://do/incr?type=blocks', { method: 'POST' });
    await stub.fetch('https://do/install?hash=hh', { method: 'POST' });

    await worker.scheduled({ scheduledTime: Date.now() }, env, { waitUntil: () => {} });

    const summary = await env.BLOCKLIST_KV.get(`stats:kids:${key}`);
    expect(summary).toBeTruthy();
    const parsed = JSON.parse(summary);
    expect(parsed).toMatchObject({ queries: 1, blocks: 1, installs: 1 });
  });
});
