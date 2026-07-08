# OroQ Android — pre-submission checklist (do in this order)

The single ordered runbook to get `uk.co.cyberheroez.oroq` from code to **Internal
testing** on Google Play. Each step says **where** it runs and **who confirms**.
Detailed text lives in the linked docs — this page is the sequence and the gates.

Legend: 🖥️ VS Code / Claude Code · 🌐 Claude in Chrome (you click final) · 👤 you only

---

## Phase A — Code is correct and proven (do first)

- [ ] **A1. Build the release-config debug build** 🖥️
  ```bash
  cd android && ./gradlew assembleDebug
  ```
  Must compile clean (includes the new `KeyVault` + `FamilyStore` changes).

- [ ] **A2. Run JVM unit tests** 🖥️
  ```bash
  cd android && ./gradlew testDebugUnitTest
  ```
  Existing suite must stay green (nothing there touches the new keystore path).

- [x] **A3. Run instrumented tests on a device/emulator** 🖥️ — ✅ DONE 2026-07-04
  ```bash
  cd android && ./gradlew connectedDebugAndroidTest
  ```
  Proves the keyset hardening: `KeyVaultTest` + `FamilyStorePrivateKeyTest` pass.
  This is the go/no-go gate for the security change — do not ship without it.
  Evidence: 16/16 green on Pixel 7 (AVD, API 16-emu) at 15:48, exit code 0 —
  `android/app/build/outputs/androidTest-results/connected/debug/`.

- [ ] **A4. Manual on-device sanity** 👤
  Fresh install → generate a pair → relaunch → confirm a synced summary still
  decrypts (proves seal/open works end-to-end on real hardware, incl. StrongBox
  fallback on non-secure-element devices).

**Gate A:** all four green → proceed. If A3 fails to compile, it's almost
certainly a trivial import — fix and re-run.

---

## Phase B — Secrets & consoles (parallel-safe, needs accounts)

Reference: `docs/RELEASE_CONSOLE_RUNBOOK.md` (full click-by-click + guardrails).

- [ ] **B1. Get both SHA-1s** 🖥️ / 👤
  Play Console → App integrity → **App signing SHA-1**; and
  `./gradlew signingReport` → **upload SHA-1**. Record both.

- [ ] **B2. Register both SHA-1s in Firebase** 🌐 (you click Save)
  Project `oroq-8a7eb` → Project settings → SHA fingerprints. **Registering the
  Play App Signing SHA is mandatory** or Google sign-in breaks in production.

- [ ] **B3. Restrict the Firebase API key** 🌐 (you click Save)
  Google Cloud → Credentials → Android key → restrict to package + SHA + only
  the APIs in use.

- [ ] **B4. (Optional) Resend domain** 🌐 + 🖥️
  Only if you want email-code login at launch. Verify domain, then
  `cd backend && npx wrangler secret put RESEND_FROM`.

**Gate B:** sign-in + push tested on a debug build after restrictions propagate.

---

## Phase C — Store assets & policy (can overlap with B)

- [x] **C1. Host the privacy policy** 🖥️ 👤 — **hard blocker** — ✅ DONE 2026-07-04
  Live at **`https://oroq-site.pages.dev/privacy-app`** (Cloudflare Pages project
  `oroq-site`). Paste that URL in C-store + Data safety. To redeploy after edits:
  ```bash
  npx wrangler pages deploy site --project-name=oroq-site
  ```
  Note: `cyberheroez.co.uk` points at a Vercel coming-soon app, not this Pages
  project — don't use that domain until DNS is rewired.

- [ ] **C2. Record the FGS demo video** 👤 — high-value
  20–40s on the child device: show the persistent "protected" notification and a
  live block. Google routinely asks for this on VPN/`specialUse` apps; having it
  ready turns a multi-week rejection into a one-pass approval.
  See `docs/FGS_SPECIAL_USE_JUSTIFICATION.md` §4.

- [x] **C3. Confirm store images** 👤 — ✅ verified 2026-07-08
  Icon 512×512, feature graphic 1024×500, and 9 phone shots (all 1080×2400)
  present in `assets/store/android/`. (Optional: re-shoot `09-device-detail.png`.)

---

## Phase D — Build & upload the release

- [x] **D1. Ensure `android/keystore.properties` exists** 👤 — ✅ present, gitignored
  (verified 2026-07-08: `keystore.properties` + `oroq-upload.jks` untracked by git).
  Back up the keystore + passwords somewhere safe — losing it is
  unrecoverable once Play App Signing is enrolled with it.

- [x] **D2. Build the release AAB** 🖥️ — ✅ DONE 2026-07-04 15:53
  ```bash
  cd android && ./gradlew bundleRelease
  # output: app/build/outputs/bundle/release/app-release.aab
  ```
  Verified 2026-07-08: AAB is signed with the upload key (`META-INF/OROQ-UPL.RSA`)
  and contains the hardened `KeyVault` class (built from the post-hardening tree;
  the only later android commit is debug-only cleartext config, no release impact).

- [ ] **D3. Upload to Internal testing** 🌐/👤
  Play Console → Testing → **Internal testing** → Create release → upload AAB.
  Start here, **not** Production — this app will get manual policy review.

---

## Phase E — Play Console forms (paste-ready)

Source: `docs/PLAY_CONSOLE_CHECKLIST.md` has the exact text for each.

- [ ] **E1. VpnService declaration** 🌐 — paste from checklist §1.
- [ ] **E2. Foreground service (specialUse) ×2** 🌐 — paste from checklist §2;
  full defense in `docs/FGS_SPECIAL_USE_JUSTIFICATION.md`.
- [ ] **E3. Data safety** 🌐 — from `docs/PLAY_DATA_SAFETY.md` (collected=yes,
  shared=no, on-device, no browsing history, no ad ID). Account deletion URL:
  `https://oroq-site.pages.dev/delete-account` (live 2026-07-04; in-app path
  More → Delete account already shipped).
- [ ] **E4. Target audience & content rating** 🌐 — adult-operated parental
  control, "appeals to children? No", from checklist §4.
- [ ] **E5. Privacy policy URL** 🌐 — paste the C1 URL into store listing + Data safety.
- [ ] **E6. Store listing** 🌐 — text + images from `STORE_LISTING_ANDROID.md`.

**Gate E — final human review before submit** 👤
- [ ] Privacy URL loads and matches the app's actual data behaviour.
- [ ] Data safety answers match `PLAY_DATA_SAFETY.md` exactly.
- [ ] Demo video attached / ready to send if review asks.
- [ ] **You** press **Send for review** — never let a browser agent do this.

---

## One-glance status

| Phase | What | Blocking? |
|---|---|---|
| A | Build + tests (incl. keystore hardening) | Yes |
| B | SHA-1 in Firebase / API key | B2 yes, B3/B4 no |
| C | Privacy URL / demo video / images | C1 yes; C2 high-value |
| D | Release AAB → Internal testing | Yes |
| E | Console forms + submit | Yes |

Expect at least one round of manual policy review (VPN + `specialUse` +
child-device profile). Budget 1–3 weeks, keep all review correspondence in one
thread, and reference the justification docs when they push back.
