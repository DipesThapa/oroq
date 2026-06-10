# OroQ — Privacy Policy (Android app)

**Last updated:** 2026-06-10
**Controller:** CyberHeroez CIC, United Kingdom — `dipesh@cyberheroez.co.uk`

This policy covers the **OroQ Android app** (`uk.co.cyberheroez.oroq`), a parental-control and web-filtering app with a parent role and a child role on the same app. It is separate from the OroQ browser-extension policy (`PRIVACY.md`). Where the two differ, this document governs the Android app.

OroQ is designed to be **transparent and on-device first**: the child phone is never monitored covertly, the filtering runs locally, and the activity a parent sees is **end-to-end encrypted** so that OroQ's own servers cannot read it.

## 1. Who the app is for

- **Parent device:** an adult sets up filtering, screen-time limits and app blocking, and views a child's activity summary.
- **Child device:** runs on-device filtering and reports a summary to the linked parent. OroQ is always visibly installed and shows its protection status on the child's home screen; it does not hide itself.

## 2. What data the app processes, and where it goes

### On the child device (processed locally)
- **Web requests (DNS):** evaluated on-device by a local-only `VpnService` to block harmful domains and apply Safe Search / YouTube Restricted Mode. **Traffic is never routed to OroQ or any third party** — the VPN terminates on the device. Full URLs and page content are never read or stored; only the **domain** of a blocked request is recorded.
- **Foreground app + screen time:** read via Android Usage Access to enforce app blocks and screen-time limits.
- **Installed-apps list:** read so the parent can choose which apps to block.
- **Recent block events:** a rolling local log of up to 50 entries (domain or app name, category, timestamp), stored in the app's private storage.

### Sent to the linked parent (end-to-end encrypted)
On a periodic sync the child device assembles an activity **summary** and uploads it to OroQ's relay server **encrypted for the parent device only** (Tink hybrid encryption, HPKE over X25519). The summary contains: protection on/off, today's screen-time total and limit, top apps by time, blocked-today counts, recent block events (domain/app + category + time), enabled block categories, the installed-apps list, blocked-app selection, and Safe Search / YouTube Restricted state.

**OroQ's server stores only the encrypted blob and cannot decrypt it** — it holds no decryption key. The blob auto-expires after **7 days**. Remote control commands from the parent (also encrypted) expire after **24 hours**.

### Account data (parent only)
- **Email address** — used to sign in (one-time email code) and to identify the parent account. Stored on OroQ's server (Cloudflare D1).
- **Google sign-in (optional):** if the parent chooses "Continue with Google," Google returns a verified email which is used exactly as above. OroQ receives no other Google profile data and stores no Google tokens. A one-time email code remains available as an alternative.
- **Device pairing keys:** public encryption keys for the paired devices, stored to route encrypted summaries. Private keys never leave the device that generated them.

### Not collected
No browsing history or full URLs. No message, photo, video, or microphone content. No contacts. No location. No advertising identifiers. No third-party analytics or ad SDKs. No hardware identifiers — device identity is a random app-generated UUID.

## 3. Legal basis (UK GDPR)

- **Performance of the service** the parent requests (filtering, screen-time, the activity summary): necessary for the parental-control function the user installed.
- **Legitimate interests / safeguarding** for organisational (school) deployments, supported by the DPIA template in `docs/DPIA_TEMPLATE_UK.md` and the KCSIE matrix in `docs/KCSIE_COMPLIANCE_MATRIX.md`.
- Child-facing screens collect no data beyond what the linked parent's settings require, in line with the UK Age Appropriate Design Code.

## 4. Retention

| Data | Where | Retention |
|---|---|---|
| Encrypted activity summary | Server (Cloudflare KV) | 7 days, then auto-deleted |
| Pending remote command (encrypted) | Server (KV) | 24 hours |
| Sign-in email code (hashed) | Server (KV) | 10 minutes |
| Parent session token | Device | 30 days |
| Parent account (email) | Server (D1) | Until account deletion is requested |
| Local block-event log | Child device | Rolling, last 50 events only |
| On-device settings, PIN hash, keys | Device | Until the app is uninstalled |

## 5. Sharing

OroQ does not sell data and shares it with no advertisers or data brokers. Processors used to run the service: **Cloudflare** (Workers/KV/D1 hosting and the pairing relay) and, for sign-in only, **Resend** (sends the one-time email code) and **Google** (verifies "Sign in with Google"). Each receives only the minimum needed for that function. The activity summary is encrypted such that no processor — including Cloudflare — can read it.

## 6. Your rights and controls

- **Access / deletion:** email `dipesh@cyberheroez.co.uk` to access or delete your account and associated data. Uninstalling the child app stops all collection and deletes local data; the encrypted summary expires from the server within 7 days regardless.
- **Withdraw:** a parent can disable any protection or unpair a device at any time. Children can see protection status on the device at all times.
- **Security disclosures:** see `SECURITY.md`.

## 7. Children's data

OroQ is a tool operated by a parent or a school for a child's safety. It is not directed at children as consumers and shows no ads. Child-side data is minimised to what the supervising adult's settings produce, is encrypted in transit and at rest on the server, and is never used for profiling or advertising.

## 8. Changes

Material changes will update the date above and, where required, be surfaced in-app.
