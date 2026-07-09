# OroQ Pro — license fulfilment go-live runbook

Everything needed to turn the built Pro tier into working, paid sales.
Do these in order, on your own machine (they need your Cloudflare login and a
private key that must never leave your computer). 🖥️ = terminal, 🌐 = browser, 👤 = you only.

The mechanism (already built + tested): buyer pays on Gumroad → Gumroad pings the
Cloudflare Worker → Worker signs an offline license key + emails it → buyer pastes
it into the extension → verified on-device, Pro unlocks. No server is contacted at
use time; the extension stays 100% on-device.

---

## 1. Generate your signing keypair 🖥️👤 — do this FIRST, keep the private key secret

```bash
cd <repo root>
node scripts/license.mjs keygen
```

It prints two JWKs:
- **PUBLIC JWK** → paste into `src/background.js`, replacing the `LICENSE_PUBLIC_KEY_JWK`
  placeholder (~line 70, marked `TODO(owner)`).
- **PRIVATE JWK** → save to a file you keep safe (a password manager or a local
  file OUTSIDE the repo). NEVER commit it. It goes into the Worker as a secret (step 3).

> Why you (not the tooling) generate this: the private key signs every license.
> If it ever leaks, anyone can mint free Pro keys. Generate it locally and it never
> touches logs, chat, or any server but your own Worker.

Then rebuild the extension so it ships with YOUR public key:
```bash
npm run zip:webstore
```

## 2. Apply the database migration 🖥️

```bash
cd backend
npx wrangler d1 migrations apply oroq-family --remote
```
Creates the `licenses` table (idempotent record of every issued key).
NOTE: `--remote` is required — without it wrangler targets the LOCAL dev DB,
not production, so the live table would never be created.

## 3. Set the Worker secrets + deploy 🖥️👤

```bash
cd backend
npx wrangler secret put LICENSE_PRIVATE_KEY_JWK   # paste the PRIVATE JWK from step 1
npx wrangler secret put GUMROAD_SELLER_ID         # your Gumroad seller id (see step 4)
# (Skip LEMONSQUEEZY_WEBHOOK_SECRET — you're selling via Gumroad.)
npx wrangler deploy
```
Note the deployed URL, e.g. `https://oroq-family.<subdomain>.workers.dev`.
Sanity check: `curl https://<worker-url>/health` should return `{"ok":true}`.

## 4. Find your Gumroad seller id + wire the webhook 🌐👤

- Seller id: Gumroad → Settings → Advanced (or check any existing ping payload).
  Put it in the `GUMROAD_SELLER_ID` secret above.
- Webhook: Gumroad → Settings → Advanced → **Ping** → set the URL to
  `https://<your-worker-url>/license/webhook`. Save.

## 5. Test end-to-end BEFORE publishing 🌐👤

- Use a Gumroad test purchase (or buy it yourself with a discount code set to 100%).
- Confirm the license key arrives by email (check spam). The Worker also stores it
  in D1: `npx wrangler d1 execute oroq-family --command "SELECT * FROM licenses"`.
- Paste the key into the extension popup → OroQ Pro → Enter license key → Activate.
  Pro controls should unlock (Committed Lock, Scheduled Focus, custom durations).
- Lost-key path: `POST https://<worker-url>/license/resend` with `{"email":"..."}`
  re-emails the latest key.

## 6. Payout + publish 👤

- Complete Gumroad payout/bank + tax details (Settings → Payments). Money can't
  settle until this is done.
- Only now: Gumroad → **Publish**. And upload the cleaned `dist/extension.zip` as an
  UPDATE to the live Chrome Web Store listing (keeps the 468-install history).

---

## Guardrails
- Do NOT publish the Gumroad product or share `dipesmith.gumroad.com/l/pro` until
  step 5 passes — before the Worker is live, a buyer pays and gets no key.
- Back up the private JWK. If you lose it you can still sign with a new keypair, but
  you'd have to ship a new extension build with the new public key, and keys issued
  under the old key would stop validating.
- The public key currently in `src/background.js` is a PLACEHOLDER demo key — until
  you complete step 1, no license (test or real) can activate.
