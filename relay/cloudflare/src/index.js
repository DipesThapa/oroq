function json(body, status = 200, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS'
  };
}

function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ''));
  return crypto.subtle.digest('SHA-256', data).then((buf) => {
    const bytes = new Uint8Array(buf);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  });
}

function bearer(request) {
  const auth = String(request.headers.get('Authorization') || '');
  if (!auth.startsWith('Bearer ')) return '';
  const token = auth.slice('Bearer '.length).trim();
  return token.length ? token : '';
}

function okPairingId(value) {
  return /^[a-f0-9]{12,64}$/i.test(String(value || ''));
}

function parseJson(request) {
  return request.json().catch(() => ({}));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...corsHeaders(), 'Access-Control-Max-Age': '86400' } });
    }

    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true });

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return json({ error: 'not-found' }, 404);
    const [resource, pairingId] = parts;
    if (!okPairingId(pairingId)) return json({ error: 'bad-pairing-id' }, 400);

    const id = env.PAIRINGS.idFromName(pairingId);
    const stub = env.PAIRINGS.get(id);
    return stub.fetch(request);
  }
};

export class PairingRelay {
  constructor(state) {
    this.state = state;
    this.maxMailbox = 500;
  }

  async load() {
    const stored = await this.state.storage.get('record');
    if (stored && typeof stored === 'object') return stored;
    return { secretHash: '', data: {}, mailbox: [] };
  }

  async save(record) {
    await this.state.storage.put('record', record);
  }

  purgeExpired(record) {
    const expiresAt = Number(record && record.data && record.data.expiresAt) || 0;
    if (expiresAt && expiresAt <= Date.now()) {
      return { secretHash: '', data: {}, mailbox: [] };
    }
    return record;
  }

  async authOrInit(record, secret) {
    const provided = await sha256Hex(secret);
    if (!record.secretHash) {
      record.secretHash = provided;
      return true;
    }
    return record.secretHash === provided;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return json({ error: 'not-found' }, 404);
    const [resource] = parts;

    let record = await this.load();
    record = this.purgeExpired(record);

    const secret = bearer(request);
    if (!secret) return json({ error: 'missing-bearer' }, 401);
    const ok = await this.authOrInit(record, secret);
    if (!ok) return json({ error: 'bad-secret' }, 403);

    if (resource === 'pairings') {
      if (request.method === 'GET') {
        await this.save(record);
        return json(record.data || {});
      }
      if (request.method === 'PUT') {
        const body = await parseJson(request);
        record.data = { ...(record.data || {}), ...(body || {}) };
        await this.save(record);
        return json(record.data);
      }
      return json({ error: 'method-not-allowed' }, 405);
    }

    if (resource === 'mailbox') {
      if (request.method === 'POST') {
        const body = await parseJson(request);
        const item = body && typeof body === 'object' ? body : null;
        if (!item || !item.id || !item.ts || !item.from || !item.payload) {
          return json({ error: 'bad-message' }, 400);
        }
        const mailbox = Array.isArray(record.mailbox) ? record.mailbox : [];
        mailbox.unshift(item);
        record.mailbox = mailbox.slice(0, this.maxMailbox);
        await this.save(record);
        return json({ ok: true });
      }
      if (request.method === 'GET') {
        const since = Number(url.searchParams.get('since') || 0) || 0;
        const mailbox = Array.isArray(record.mailbox) ? record.mailbox : [];
        const items = mailbox.filter((m) => (Number(m.ts) || 0) > since);
        await this.save(record);
        return json({ items });
      }
      return json({ error: 'method-not-allowed' }, 405);
    }

    return json({ error: 'not-found' }, 404);
  }
}

