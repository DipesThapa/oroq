# Google Play Data Safety — field-by-field answers (OroQ Android)

How to fill the Play Console **Data safety** form for `uk.co.cyberheroez.oroq`, derived from the actual data flows in the codebase (see `docs/PRIVACY_ANDROID.md`). Answer in Play Console exactly as below.

## Overall

- **Does your app collect or share any of the required user data types?** → **Yes.**
- **Is all of the user data encrypted in transit?** → **Yes** (HTTPS to the worker; the activity summary is additionally end-to-end encrypted).
- **Do you provide a way for users to request that their data is deleted?** → **Yes** — in-app: "Remove this device" unpairs and deletes that child's server data (`DELETE /pair/:id` clears the pairing row + its encrypted summary + command queue); plus an email deletion request to `dipesh@cyberheroez.co.uk`. Uninstall stops collection and removes local data; the server-side encrypted summary auto-expires in 7 days.
  - ⚠️ **Account deletion gap (action needed):** Google's account-deletion policy requires deleting the *account itself*, not just data. Today "Remove this device" deletes pairings/data but the parent `accounts` row (email) persists, and there is no in-app "delete account" nor a web deletion URL. **Before submission:** add an in-app account-deletion action (delete the `accounts` row + `push_tokens`) **or** publish a web deletion-request URL and declare it in the Data Safety "deletion" section. The email-request path is the minimum Google accepts, but a self-serve path is expected for account-based apps.
- **Privacy policy URL:** the page is already built at `site/privacy-app.html`. Host the `site/` folder publicly (Firebase Hosting / GitHub Pages / cyberheroez.co.uk) and use the resulting URL (e.g. `https://cyberheroez.co.uk/privacy-app.html`). `docs/PRIVACY_ANDROID.md` is the source-of-truth copy.

## Data types — declare each as follows

For every "collected" type below: **Collected = Yes**, **Shared = No** (processors that merely host/transport on our behalf are not "sharing" under Play's definition), **Processed ephemerally = No**, **Required (not optional)** unless noted, **Purpose = App functionality** (and **Account management** for email).

| Play data type | Collect? | Why / source | Notes for the form |
|---|---|---|---|
| **Personal info → Email address** | Yes | Parent sign-in (email code or Google) | Purpose: App functionality + Account management. User can request deletion. |
| **App activity → App interactions** | Yes | Screen-time totals, blocked-today counts, protection state | Purpose: App functionality (parental controls). |
| **App activity → Installed apps** | Yes | Child's installed-apps list for the parent block picker | Purpose: App functionality. This is sensitive — keep the in-app rationale visible. |
| **App activity → Other user-generated content** | Yes | Block events: blocked **domain** or app name + category + timestamp | Purpose: App functionality. **No full URLs or page content.** |
| **App info & performance → Other** | Yes | Sync timestamps used to derive uptime/last-seen | Purpose: App functionality. |
| **Device or other IDs** | Yes | Random **app-generated** pairing UUID + device public key; **FCM registration token** (parent device, for push) | Declare as app-generated / messaging identifiers, **not** a hardware or advertising ID. The FCM token is stored server-side (`push_tokens`) only to deliver parent notifications. |

### Explicitly answer **No / not collected** for:
- Location (precise or approximate)
- Web browsing history *(domains of blocked sites are "other UGC" above, not browsing history — but be ready to explain this in review)*
- Financial info, Health, Messages, Photos/Videos, Audio, Files, Contacts, Calendar
- Advertising ID / advertising or marketing purposes

## Mandatory accompanying declarations (outside the Data Safety tab)

These are the items most likely to trigger rejection for this app class — prepare them alongside the form:

1. **VpnService declaration.** In the listing/policy, state plainly: *"OroQ uses Android's VpnService to filter DNS on-device for parental web filtering. It does not route, inspect, or transmit network traffic off the device."* Expect manual review.
2. **Restricted permissions form — `PACKAGE_USAGE_STATS` (Usage Access)** and **`SYSTEM_ALERT_WINDOW` (overlay):** justify as the screen-time/app-blocking enforcement and the block screen, respectively.
3. **Installed-apps disclosure:** Play treats reading the full app inventory as sensitive; declare the parental-control purpose.
4. **Foreground service types:** the manifest declares `specialUse` for the VPN and monitor services with honest subtype strings — keep them; Play requires an FGS-type justification at submission.
5. **Families / parental-control:** in the content-rating and target-audience questionnaires, describe OroQ as a parental-monitoring tool operated by an adult, with the child device showing persistent, visible protection (not covert). This keeps it clear of the stalkerware ban.

## Pre-submission mechanical checklist (not data-safety, but blocks release)

- [x] Build a **release** AAB signed with the upload keystore (`android/oroq-upload.jks`, gitignored). R8 minify + resource shrink enabled and verified on device (Tink crypto + WorkManager confirmed working). `gradlew bundleRelease`.
- [x] Back up `android/oroq-upload.jks` + `android/keystore.properties` off-machine — they are gitignored and exist only locally. **Losing the upload key blocks app updates** (recoverable via Play App Signing reset, but back it up anyway).
- [x] Add the **upload-key SHA-1** (`67:EF:C2:43:CB:80:B9:5B:90:CC:5B:47:1A:5C:F2:C6:76:77:02:0F`) to the Android OAuth client in the `oroq` Google Cloud project — covers sideloaded/locally-signed builds.
- [x] **Play App Signing SHA-1 registered.** AAB uploaded to internal testing; Play app-signing SHA-1 `B3:1D:45:5D:31:CF:4D:5F:3D:AB:A7:56:0D:E2:BF:21:EF:A8:79:A3` added as the "Android oroq" OAuth client in the `oroq` GCP project. "oroq local" client carries the upload/debug key for sideloaded builds. Web client "OroQ" (`…k2nh…`) is the app's `GOOGLE_WEB_CLIENT_ID`. Sign-in works for both Play and local builds.
- [ ] (Local dev only) Debug-build Google sign-in needs the **debug** SHA-1 (`C1:6E:EE:5B:24:81:28:30:51:54:F2:C4:71:C3:D1:7E:E5:C8:7C:43`) on a separate Android OAuth client — or just use the email-OTP path when testing debug builds.
- [x] Privacy policy page built at `site/privacy-app.html` (styled to match the existing site; linked from index/support/features navs). Host the `site/` folder publicly (Firebase Hosting / GitHub Pages / cyberheroez.co.uk) and use the resulting URL — e.g. `https://cyberheroez.co.uk/privacy-app.html` — in the Play listing and Data Safety form. `docs/PRIVACY_ANDROID.md` remains the source-of-truth copy.
- [ ] Complete content rating + target audience questionnaires.
- [ ] Restricted-permission declarations at submission: **VpnService**, **PACKAGE_USAGE_STATS** (Usage Access), **SYSTEM_ALERT_WINDOW** (overlay), and the `specialUse` foreground-service types — see §"Mandatory accompanying declarations" above.
- [ ] (Recommended) Set the worker's `RESEND_API_KEY` / `RESEND_FROM` so email sign-in works for non-Google parents in production.

### Two-projects note (Google Cloud + Firebase)
Sign-in lives in the **`oroq`** GCP project (web + Android OAuth clients); push lives in the separate **`oroq-8a7eb`** Firebase project (FCM). This split is fine — FCM uses `google-services.json` + the service account (no OAuth SHA-1), and sign-in uses the web client ID. The "another project uses this SHA-1" warning in Firebase is cosmetic; the SHA-1 was removed from Firebase to clear it, with no effect on push.
