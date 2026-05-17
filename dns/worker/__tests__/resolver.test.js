import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveUpstream } from '../src/resolver.js';

describe('resolveUpstream', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs the query bytes to the upstream URL', async () => {
    const fakeResp = new Uint8Array([1, 2, 3, 4]);
    globalThis.fetch.mockResolvedValue(
      new Response(fakeResp, {
        status: 200,
        headers: { 'content-type': 'application/dns-message' },
      })
    );

    const query = new Uint8Array([9, 9, 9, 9]);
    const out = await resolveUpstream('https://example.com/dns-query', query);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://example.com/dns-query');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/dns-message');
    expect(new Uint8Array(init.body)).toEqual(query);

    expect(out).toEqual(fakeResp);
  });

  it('throws on non-2xx upstream response', async () => {
    globalThis.fetch.mockResolvedValue(new Response('', { status: 500 }));
    await expect(
      resolveUpstream('https://example.com/dns-query', new Uint8Array([0]))
    ).rejects.toThrow(/upstream/);
  });
});
