# OroQ — Release console runbook (for Claude in Chrome)

Step-by-step tasks to run in the browser with **Claude in Chrome**, plus the two
terminal commands that pair with them (run those in **VS Code / Claude Code**).

These are the pre-submission items that live in web consoles, not in code:
1. Register the **Play App Signing** cert SHA-1 in Firebase (so Google sign-in
   keeps working in the production build).
2. Restrict the **Firebase API key** in Google Cloud (hygiene).
3. (Optional) Verify the **Resend** sending domain (email-code login).

---

## GUARDRAILS — read first, applies to every step

- **You (the human) stay in the loop.** Claude in Chrome operates in your
  logged-in Google account. It may navigate, read the page, and fill fields —
  but **you personally click the final confirm** on anything that writes:
  adding a SHA, saving an API-key restriction, publishing DNS.
- **Never click "Submit for review" / "Send for publishing"** in Play Console
  from the browser agent. Uploading the AAB and hitting submit is a human step.
- **Do not paste, screenshot, or echo any secret** (keystore passwords, the
  `FCM_SERVICE_ACCOUNT` JSON, Resend API keys). These are not needed for any
  step below. If a page shows one, do not reproduce it in chat.
- If a page looks unfamiliar or asks you to install/authorize something
  unexpected, **stop and ask the human** before proceeding.

---

## Step 0 — Get the Play App Signing SHA-1 (VS Code, do this first)

The value you need comes from Google, not your local keystore. Two sources:

- **Play Console** → your app → **Test and release → Setup → App integrity →
  App signing** → copy the **SHA-1** under *App signing key certificate*.
- Your local **upload key** SHA-1 (also worth registering) comes from VS Code:
  ```bash
  cd android
  ./gradlew signingReport
  # copy the SHA1 line under Variant: release (Config: release)
  ```

You will register **both** the App Signing SHA-1 and the upload SHA-1 in Step 1.
Registering only the upload key is the classic trap: sign-in works in internal
testing, then breaks in production because Play re-signs with the App Signing key.

Paste both SHA-1 values here before starting Step 1:
- App signing SHA-1: `________________________________________`
- Upload SHA-1:       `________________________________________`

---

## Step 1 — Register SHA-1s in Firebase  (Claude in Chrome)

**Goal:** add both SHA-1 fingerprints to the Android app in the Firebase project
`oroq-8a7eb`, package `uk.co.cyberheroez.oroq`.

1. Navigate to `https://console.firebase.google.com/`.
2. Open project **oroq-8a7eb**.
3. Gear icon → **Project settings** → **General** tab.
4. Scroll to **Your apps** → the Android app `uk.co.cyberheroez.oroq`.
5. Under **SHA certificate fingerprints**, click **Add fingerprint**.
6. Paste the **App signing SHA-1** → *(human)* click **Save**.
7. Click **Add fingerprint** again → paste the **Upload SHA-1** → *(human)* **Save**.
8. Confirm both now appear in the list. Report the final list back.

> No file re-download is required for Credential Manager sign-in (the web client
> id is hardcoded in `FamilyConfig.GOOGLE_WEB_CLIENT_ID`). If you *do* re-download
> `google-services.json`, hand it to VS Code to replace `android/app/google-services.json`;
> do not paste its contents into chat.

---

## Step 2 — Restrict the Firebase API key  (Claude in Chrome)

**Goal:** lock the Android API key so it only works for this app. It is a client
identifier (safe to ship), but restricting it is free defense-in-depth.

1. Navigate to `https://console.cloud.google.com/apis/credentials?project=oroq-8a7eb`.
2. Under **API keys**, open the **Android key** (auto-created for Firebase).
3. **Application restrictions** → select **Android apps** →
   **Add** an item: package `uk.co.cyberheroez.oroq` + the **App signing SHA-1**
   from Step 0.
4. **API restrictions** → **Restrict key** → allow only the APIs this app calls
   (typically **Firebase Cloud Messaging API** and any Firebase Installations /
   Identity Toolkit entries already listed). Do not add unrelated APIs.
5. *(human)* click **Save**. Note: restriction changes can take a few minutes to
   propagate — test a debug build's push + sign-in afterward.

> If unsure which APIs are in use, list what the console already shows as
> "recently used" for this key and confirm with the human before narrowing.

---

## Step 3 (optional) — Verify the Resend sending domain

Only needed if you want email-code login to work for parents who don't use
Google sign-in. Skippable for the first internal-testing round.

**Browser (Claude in Chrome):**
1. Navigate to `https://resend.com/domains`.
2. **Add Domain** → enter your sending domain (e.g. `cyberheroez.co.uk`).
3. Resend shows DNS records (SPF/DKIM/`MX`). If your registrar/DNS is open in
   the same browser session, add them there; otherwise hand the record list to
   the human to enter at their DNS provider.
4. Wait for Resend to show **Verified**.

**VS Code (Claude Code) — after the domain shows Verified:**
```bash
cd backend
npx wrangler secret put RESEND_FROM
# value, e.g.:  OroQ <noreply@cyberheroez.co.uk>
```
No redeploy needed.

---

## Done-checklist

| Step | Where | Human confirms |
|------|-------|----------------|
| 0. Get SHA-1s | VS Code / Play Console | copy 2 values |
| 1. SHA-1s in Firebase | Chrome | clicks Save x2 |
| 2. Restrict API key | Chrome | clicks Save |
| 3. Resend domain | Chrome + VS Code | DNS + secret |

After these: host the privacy page, upload the AAB to **Internal testing**, and
fill the Play Console forms using the paste-ready text in
`docs/PLAY_CONSOLE_CHECKLIST.md`.
