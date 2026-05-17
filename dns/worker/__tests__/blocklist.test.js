import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkBlocked, clearCache } from '../src/blocklist.js';

function mockKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key) => store.get(key) ?? null),
    _store: store,
  };
}

describe('checkBlocked', () => {
  beforeEach(() => {
    clearCache();
  });

  it('returns true on exact domain match', async () => {
    const kv = mockKv({ 'kids:domain:pornhub.com': '1' });
    expect(await checkBlocked(kv, 'kids', 'pornhub.com')).toBe(true);
  });

  it('returns false when not in list', async () => {
    const kv = mockKv({ 'kids:domain:pornhub.com': '1' });
    expect(await checkBlocked(kv, 'kids', 'example.com')).toBe(false);
  });

  it('matches subdomain via parent walk', async () => {
    const kv = mockKv({ 'kids:domain:pornhub.com': '1' });
    expect(await checkBlocked(kv, 'kids', 'img.cdn.pornhub.com')).toBe(true);
  });

  it('does not match across levels', async () => {
    const kv = mockKv({ 'kids:domain:roblox.com': '1' });
    expect(await checkBlocked(kv, 'teens', 'roblox.com')).toBe(false);
  });

  it('does not match on suffix that is not a parent label', async () => {
    // "evilpornhub.com" should NOT match because of "pornhub.com" in list.
    const kv = mockKv({ 'kids:domain:pornhub.com': '1' });
    expect(await checkBlocked(kv, 'kids', 'evilpornhub.com')).toBe(false);
  });

  it('caches lookups (second call hits no KV)', async () => {
    const kv = mockKv({ 'kids:domain:pornhub.com': '1' });
    await checkBlocked(kv, 'kids', 'pornhub.com');
    kv.get.mockClear();
    await checkBlocked(kv, 'kids', 'pornhub.com');
    expect(kv.get).not.toHaveBeenCalled();
  });

  it('caches negative results too', async () => {
    const kv = mockKv({});
    expect(await checkBlocked(kv, 'kids', 'example.com')).toBe(false);
    kv.get.mockClear();
    expect(await checkBlocked(kv, 'kids', 'example.com')).toBe(false);
    expect(kv.get).not.toHaveBeenCalled();
  });
});
