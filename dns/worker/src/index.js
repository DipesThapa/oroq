import { extractLevel } from './router.js';
import { parseQuestionDomain, buildNxdomainResponse } from './dns-message.js';
import { checkBlocked } from './blocklist.js';
import { resolveUpstream } from './resolver.js';
import { hashClientIp, dateKey } from './stats.js';

export { StatsCounter } from './stats-do.js';

const DEFAULT_UPSTREAM = 'https://cloudflare-dns.com/dns-query';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const level = extractLevel(url.hostname);
    if (!level) {
      return new Response('invalid filter level', { status: 400 });
    }
    if (url.pathname !== '/dns-query') {
      return new Response('not found', { status: 404 });
    }

    let queryBytes;
    if (request.method === 'POST') {
      const buf = await request.arrayBuffer();
      queryBytes = new Uint8Array(buf);
    } else if (request.method === 'GET') {
      const dns = url.searchParams.get('dns');
      if (!dns) return new Response('missing dns param', { status: 400 });
      queryBytes = base64UrlDecode(dns);
    } else {
      return new Response('method not allowed', { status: 405 });
    }

    let domain;
    try {
      domain = parseQuestionDomain(queryBytes);
    } catch {
      return new Response('malformed query', { status: 400 });
    }

    const upstream = env.UPSTREAM_DNS_URL || DEFAULT_UPSTREAM;
    const blocked = await safeCheckBlocked(env, level, domain);

    let responseBytes;
    let counterType;
    if (blocked) {
      responseBytes = buildNxdomainResponse(queryBytes);
      counterType = 'blocks';
    } else {
      try {
        responseBytes = await resolveUpstream(upstream, queryBytes);
      } catch {
        responseBytes = buildServfailResponse(queryBytes);
      }
      counterType = 'queries';
    }

    ctx.waitUntil(recordStats(env, request, level, counterType));

    return new Response(responseBytes, {
      status: 200,
      headers: { 'content-type': 'application/dns-message' },
    });
  },
};

async function safeCheckBlocked(env, level, domain) {
  try {
    return await checkBlocked(env.BLOCKLIST_KV, level, domain);
  } catch (err) {
    console.error('blocklist lookup failed', err);
    return false;
  }
}

async function recordStats(env, request, level, counterType) {
  try {
    const date = dateKey();
    const id = env.STATS_DO.idFromName(`${level}:${date}`);
    const stub = env.STATS_DO.get(id);
    await stub.fetch(`https://do/incr?type=${counterType}`, { method: 'POST' });

    const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
    const salt = (await env.BLOCKLIST_KV.get('meta:dailysalt')) ?? 'default-salt';
    const hash = await hashClientIp(ip, salt, level);
    await stub.fetch(`https://do/install?hash=${hash}`, { method: 'POST' });
  } catch (err) {
    console.error('stats recording failed', err);
  }
}

function buildServfailResponse(queryBytes) {
  const out = new Uint8Array(queryBytes);
  const rd = queryBytes[2] & 0x01;
  out[2] = 0x80 | rd;       // QR=1, RA=0
  out[3] = 0x02;            // rcode=SERVFAIL
  out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0;
  out[10] = 0; out[11] = 0;
  return out;
}

function base64UrlDecode(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
