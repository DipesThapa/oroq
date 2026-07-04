# OroQ — Play Console submission walkthrough (copy-paste)

One place to work through the Play Console forms for `uk.co.cyberheroez.oroq`.
Everything here is **typed/pasted/clicked in the Console web UI** — no PDFs are
uploaded. The only files you upload are the **AAB** and the **store images**.
Sources: `PLAY_DATA_SAFETY.md`, `STORE_LISTING_ANDROID.md`, `PRIVACY_ANDROID.md`.

App facts to have handy: package `uk.co.cyberheroez.oroq`, version `1.0`,
minSdk 26, targetSdk 36.

---

## 0. Upload the build (do first)

- Play Console → **Testing → Internal testing** (recommended first) or
  **Production → Create release**.
- Upload `android/app/build/outputs/bundle/release/app-release.aab`
  (HTTPS-only, signed with the upload key — already built).
- Confirm Play App Signing is enabled (it is — signing cert `B3:1D…` is
  registered, so Google sign-in works for Play builds).

---

## 1. VpnService declaration — *App content → "Sensitive app permissions" / VPN*

Tick that the app uses `VpnService`, then paste:

> OroQ uses Android's VpnService to filter DNS **on the device** for parental
> web filtering (blocking adult, malware, phishing and similar categories). It
> establishes a local VPN that routes only DNS to an on-device resolver. It does
> **not** route, proxy, inspect, log, or transmit the user's network traffic or
> browsing off the device. Filtering is core, user-visible functionality and the
> child device always shows OroQ is active.

Expect manual review.

## 2. Foreground service permissions — *App content → "Foreground service permissions"*

> **Full justification + reviewer rebuttals:** `docs/FGS_SPECIAL_USE_JUSTIFICATION.md`
> (type-elimination matrix, pushback responses, demo-video guidance). This is the
> item most likely to draw a manual-review challenge — read that file first.

Two services use `FOREGROUND_SERVICE_SPECIAL_USE`. For each, paste:

- **VPN service** (`On-device parental DNS filtering`):
  > A persistent foreground service runs the on-device DNS filter so web
  > protection stays active. It must run continuously while protection is on;
  > no standard FGS type matches on-device parental DNS filtering.

- **Monitor service** (`On-device app blocking and screen-time limits`):
  > A persistent foreground service enforces app blocking and screen-time limits
  > by checking the foreground app. It must run continuously while limits are
  > active; no standard FGS type matches parental app-blocking/screen-time.

## 3. Data safety — *App content → Data safety* (questionnaire)

- Collects user data? **Yes**. Encrypted in transit? **Yes**. Deletion method?
  **Yes** (in-app "Delete account" + email request).
- **Declare COLLECTED = Yes, SHARED = No, not ephemeral, Required, Purpose =
  App functionality** (Email also "Account management"):
  - Personal info → **Email address**
  - App activity → **App interactions** (screen-time, blocked counts, protection state)
  - App activity → **Installed apps** (child app list for the parent picker)
  - App activity → **Other user-generated content** (blocked domain/app + category + time — **no full URLs**)
  - App info & performance → **Other** (sync timestamps)
  - Device or other IDs → app-generated pairing UUID + public key + **FCM token**
- **Answer NO** to: Location, Web browsing history, Financial, Health, Messages,
  Photos/Videos, Audio, Files, Contacts, Calendar, **Advertising ID**.
- Full field-by-field rationale: `PLAY_DATA_SAFETY.md`.

## 4. Target audience & content rating — *App content*

- **Target audience:** select adult age bands; OroQ is **operated by a
  parent/guardian**, not directed at children. (If asked, the child-side app is
  set up and controlled by the adult.)
- **"Appeals to children?"** → No.
- **Content rating questionnaire:** category Utility/Parenting; no violence,
  sexual content, gambling, etc. → expect Everyone/PEGI 3.
- **Families policy note (paste if a free-text box is offered):**
  > OroQ is a parental-control tool operated by an adult. The child device shows
  > persistent, visible protection (not covert), filters on-device, and collects
  > nothing beyond the parent's chosen settings. This is transparent parental
  > control, not background monitoring.
- Supporting: `KCSIE_COMPLIANCE_MATRIX.md`, `PRIVACY_ANDROID.md`.

## 5. Privacy policy URL — *Store listing + Data safety*

- The page is live: `site/` is deployed to Cloudflare Pages (project
  `oroq-site`, via `npx wrangler pages deploy site --project-name=oroq-site`).
- Paste the live URL `https://oroq-site.pages.dev/privacy-app`
  into **Store listing → Privacy policy** and the **Data safety** form.
  (Do not use `cyberheroez.co.uk` — that domain currently points at a Vercel
  coming-soon app, not this Pages project.)

## 6. Store listing — *Grow → Store presence → Main store listing*

Text (copy from `STORE_LISTING_ANDROID.md`):
- **Name:** `OroQ`
- **Short description (≤80):** `On-device web filtering & screen-time for families. Private. Parent-controlled.`
- **Full description:** the block in `STORE_LISTING_ANDROID.md`.
- Category **Parenting**; contact `dipesh@cyberheroez.co.uk`; website `https://cyberheroez.co.uk/`.

Images (already created, Play-compliant — just upload):
- **Icon 512×512:** `assets/store/android/icon-512.png` ✅
- **Feature graphic 1024×500:** `assets/store/android/feature-graphic-1024x500.png` ✅
- **Phone screenshots 1080×2400 (2–8):** `assets/store/android/01..09-*.png` ✅
  - ⚠️ Recommended: **recapture `09-device-detail.png`** — it predates this
    session's device-detail polish (offline banner, friendly app names, "1h").
    Cosmetic only; the current set is still submittable.

## 7. (Optional) Resend domain — real email login for all users

Google sign-in already works for Play builds, so this is optional, but email-code
login won't deliver until a domain is verified:
1. Resend dashboard → Domains → add your domain → add the DNS records.
2. `cd backend && npx wrangler secret put RESEND_FROM` → `OroQ <noreply@yourdomain>`.
No redeploy needed.

---

## Quick status

| Item | Artifact ready? | Action |
|------|-----------------|--------|
| 0. AAB | ✅ built | upload |
| 1. VpnService | ✅ text above | paste in Console |
| 2. FGS | ✅ text above | paste in Console |
| 3. Data safety | ✅ `PLAY_DATA_SAFETY.md` | answer questionnaire |
| 4. Families/rating | ✅ text above | answer questionnaire |
| 5. Privacy URL | ✅ page built | host + paste URL |
| 6. Store listing | ✅ copy + images exist | upload + paste (optional re-shoot #09) |
| 7. Resend domain | steps above | optional |
