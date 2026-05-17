import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import worker from '../src/index.js';
import { clearCache } from '../src/blocklist.js';
import { env } from 'cloudflare:test';

// Two precomputed wire queries reused throughout.
const QUERY_EXAMPLE_COM = new Uint8Array([
  0xab, 0xcd, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65,
  0x03, 0x63, 0x6f, 0x6d,
  0x00,
  0x00, 0x01,
  0x00, 0x01,
]);

const QUERY_PORNHUB_COM = new Uint8Array([
  0xde, 0xad, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x07, 0x70, 0x6f, 0x72, 0x6e, 0x68, 0x75, 0x62,
  0x03, 0x63, 0x6f, 0x6d,
  0x00,
  0x00, 0x01,
  0x00, 0x01,
]);

function postDohQuery(host, body) {
  return new Request(`https://${host}/dns-query`, {
    method: 'POST',
    headers: { 'content-type': 'application/dns-message' },
    body,
  });
}

describe('Worker integration', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(async () => {
    // Fresh blocklist cache so cached "blocked" decisions don't leak across tests.
    clearCache();
    // Seed the blocklist KV with one blocked domain for kids.
    await env.BLOCKLIST_KV.put('kids:domain:pornhub.com', '1');
    // Mock upstream fetch — return a pretend valid response.
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([0, 0, 0, 0]), {
        status: 200,
        headers: { 'content-type': 'application/dns-message' },
      })
    );
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns NXDOMAIN for a blocked domain on kids level', async () => {
    const req = postDohQuery('kids.dns.cyberheroez.co.uk', QUERY_PORNHUB_COM);
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('application/dns-message');
    const bytes = new Uint8Array(await resp.arrayBuffer());
    // rcode byte should be 3 (NXDOMAIN)
    expect(bytes[3] & 0x0f).toBe(3);
  });

  it('forwards allowed domains upstream', async () => {
    const req = postDohQuery('kids.dns.cyberheroez.co.uk', QUERY_EXAMPLE_COM);
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown subdomain with 400', async () => {
    const req = postDohQuery('bogus.dns.cyberheroez.co.uk', QUERY_EXAMPLE_COM);
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.status).toBe(400);
  });

  it('returns 404 for non-/dns-query paths', async () => {
    const req = new Request('https://kids.dns.cyberheroez.co.uk/other', {
      method: 'POST',
      body: QUERY_EXAMPLE_COM,
    });
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.status).toBe(404);
  });

  it('falls back to upstream when KV throws (fail-open)', async () => {
    // Replace the KV namespace with one that always rejects.
    const brokenEnv = {
      ...env,
      BLOCKLIST_KV: {
        get: async () => { throw new Error('KV down'); },
        put: async () => {},
      },
    };
    const req = postDohQuery('kids.dns.cyberheroez.co.uk', QUERY_PORNHUB_COM);
    const resp = await worker.fetch(req, brokenEnv, { waitUntil: () => {} });
    expect(resp.status).toBe(200);
    // Upstream mock returned bytes; ensure the response is not an NXDOMAIN.
    const bytes = new Uint8Array(await resp.arrayBuffer());
    // Our mock returns four zero bytes — rcode byte must therefore be 0.
    expect(bytes[3] & 0x0f).toBe(0);
  });
});
