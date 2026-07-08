#!/usr/bin/env node
// -----------------------------------------------------------------------------
// OroQ offline license tool (owner-only CLI)
// -----------------------------------------------------------------------------
// OroQ Pro is unlocked by an OFFLINE license key — there is no server and no
// account. Keys are ECDSA P-256 signatures the extension verifies with a public
// key embedded in src/background.js (LICENSE_PUBLIC_KEY_JWK). Only the owner
// holds the matching PRIVATE key and uses this script to mint keys after a sale.
//
// A license key is:  base64url(payloadJson) + "." + base64url(signature)
// where payloadJson = {"email":"buyer@x.com","tier":"pro","iat":<unixSeconds>}
// and the signature is ECDSA/SHA-256 over the exact payload JSON bytes.
//
// Usage:
//   node scripts/license.mjs keygen
//       -> prints a fresh P-256 keypair. Paste the PUBLIC jwk into
//          src/background.js's LICENSE_PUBLIC_KEY_JWK placeholder.
//          Keep the PRIVATE jwk secret (save it to a file, never commit it).
//
//   node scripts/license.mjs sign <privateKeyJwkFile> <email>
//       -> prints a signed license key for that email. <privateKeyJwkFile> is a
//          JSON file containing the private JWK printed by keygen.
//
// No dependencies beyond Node's built-in node:crypto (webcrypto) + node:fs.
// -----------------------------------------------------------------------------

import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { subtle } = webcrypto;
const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALGO = { name: 'ECDSA', hash: 'SHA-256' };

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

async function keygen() {
  const pair = await subtle.generateKey(ALGO, true, ['sign', 'verify']);
  const publicJwk = await subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await subtle.exportKey('jwk', pair.privateKey);
  // Strip key_ops/ext noise so the pasted objects stay minimal and portable.
  for (const jwk of [publicJwk, privateJwk]) {
    delete jwk.key_ops;
    delete jwk.ext;
  }
  console.log('# --- PUBLIC KEY JWK (paste into src/background.js LICENSE_PUBLIC_KEY_JWK) ---');
  console.log(JSON.stringify(publicJwk, null, 2));
  console.log('\n# --- PRIVATE KEY JWK (KEEP SECRET — save to a file, never commit) ---');
  console.log(JSON.stringify(privateJwk));
}

async function sign(privateKeyFile, email) {
  if (!privateKeyFile || !email) {
    throw new Error('usage: node scripts/license.mjs sign <privateKeyJwkFile> <email>');
  }
  const privateJwk = JSON.parse(readFileSync(privateKeyFile, 'utf8'));
  const key = await subtle.importKey('jwk', privateJwk, ALGO, false, ['sign']);
  const payload = { email: String(email), tier: 'pro', iat: Math.floor(Date.now() / 1000) };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await subtle.sign(SIGN_ALGO, key, payloadBytes);
  const licenseKey = `${b64url(payloadBytes)}.${b64url(new Uint8Array(signature))}`;
  console.log(licenseKey);
}

const [, , cmd, ...args] = process.argv;

(async () => {
  try {
    if (cmd === 'keygen') {
      await keygen();
    } else if (cmd === 'sign') {
      await sign(args[0], args[1]);
    } else {
      console.error('Commands:\n  node scripts/license.mjs keygen\n  node scripts/license.mjs sign <privateKeyJwkFile> <email>');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
