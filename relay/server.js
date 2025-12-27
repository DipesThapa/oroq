// Minimal pairing relay for Safeguard device pairing (development use only).
// Stores only encrypted payloads in memory. Deploy behind HTTPS for production.
//
// Endpoints (all require Authorization: Bearer <secret>):
// - PUT  /pairings/:pairingId   { creatorPublicB64, creatorDeviceId, joinerPublicB64?, joinerDeviceId?, expiresAt? }
// - GET  /pairings/:pairingId
// - POST /mailbox/:pairingId    { id, ts, from, to, payload: { iv, data } }
// - GET  /mailbox/:pairingId?since=timestamp  -> { items: [...] }
//
// Run: node relay/server.js

const http = require('node:http');
const { createHash } = require('node:crypto');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT) || 8787;
const MAX_MAILBOX = 500;

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

function sha256Hex(text) {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function bearer(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return '';
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : '';
}

function okPairingId(value) {
  return /^[a-f0-9]{12,64}$/i.test(String(value || ''));
}

const pairings = new Map(); // pairingId -> { secretHash, data, mailbox: [] }

function getPairingRecord(pairingId) {
  if (!pairings.has(pairingId)) {
    pairings.set(pairingId, { secretHash: '', data: {}, mailbox: [] });
  }
  return pairings.get(pairingId);
}

function authOrInit(record, secret) {
  const provided = sha256Hex(secret);
  if (!record.secretHash) {
    record.secretHash = provided;
    return true;
  }
  return record.secretHash === provided;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
        'Access-Control-Max-Age': '86400'
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return json(res, 404, { error: 'not-found' });
    const [resource, pairingId] = parts;
    if (!okPairingId(pairingId)) return json(res, 400, { error: 'bad-pairing-id' });

    const secret = bearer(req);
    if (!secret) return json(res, 401, { error: 'missing-bearer' });
    const record = getPairingRecord(pairingId);
    if (!authOrInit(record, secret)) return json(res, 403, { error: 'bad-secret' });

    if (resource === 'pairings') {
      if (req.method === 'GET') {
        return json(res, 200, record.data || {});
      }
      if (req.method === 'PUT') {
        const body = await readJson(req);
        record.data = { ...(record.data || {}), ...(body || {}) };
        return json(res, 200, record.data);
      }
      return json(res, 405, { error: 'method-not-allowed' });
    }

    if (resource === 'mailbox') {
      if (req.method === 'POST') {
        const body = await readJson(req);
        const item = body && typeof body === 'object' ? body : null;
        if (!item || !item.id || !item.ts || !item.from || !item.payload) {
          return json(res, 400, { error: 'bad-message' });
        }
        record.mailbox.unshift(item);
        record.mailbox = record.mailbox.slice(0, MAX_MAILBOX);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'GET') {
        const since = Number(url.searchParams.get('since') || 0) || 0;
        const items = (record.mailbox || []).filter((m) => (Number(m.ts) || 0) > since);
        return json(res, 200, { items });
      }
      return json(res, 405, { error: 'method-not-allowed' });
    }

    return json(res, 404, { error: 'not-found' });
  } catch (_err) {
    return json(res, 500, { error: 'server-error' });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Safeguard relay listening on http://localhost:${PORT}`);
});
