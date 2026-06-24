# OroQ — Chromebook Force-Install Guide (for School IT Admins)

Deploy the **OroQ extension** across a managed Chromebook fleet so it is
**force-installed and cannot be removed or disabled by students** — the
enforcement model that makes OroQ bypass-proof at school (unlike an unmanaged
home laptop).

> Audience: a school / MAT IT administrator with **Google Workspace for
> Education** and Chromebooks **enrolled** in your domain (Chrome Education
> Upgrade). Time: ~10 minutes.

---

## What this achieves
- OroQ installs automatically on every targeted Chromebook.
- The student **cannot remove, disable, or hide it** (force-installed by policy).
- Scope it to the **Students** organizational unit so staff devices are untouched.
- (With one OroQ build step — see §4) push the relay URL / lock settings centrally
  so nobody configures anything by hand.

---

## Prerequisites
1. **Admin access** to the Google Admin Console (`admin.google.com`).
2. **Chromebooks enrolled** in your domain, organised into **Organizational
   Units (OUs)** — typically a `Students` OU (and `Staff`).
3. **OroQ published on the Chrome Web Store.** For a domain-only rollout you can
   publish it as **Unlisted** or **Private to your organisation** (Web Store →
   Visibility). You'll need its **Extension ID** (the 32-char `a–p` string in the
   Web Store URL, `.../detail/oroq/<EXTENSION_ID>`).

---

## 1. Force-install on student Chromebooks
1. Admin Console → **Devices → Chrome → Apps & extensions → Users & browsers**.
2. In the left OU tree, select the **Students** OU (so the policy applies only there).
3. Click the **＋ (yellow)** button → **Add Chrome app or extension by ID**.
4. Paste the OroQ **Extension ID**. (If self-hosting instead of the Web Store, also
   provide the update URL.)
5. In the row that appears, set **Installation policy → "Force install"**
   (or **"Force install + pin to browser toolbar"** so the icon is always visible).
6. Click **Save** (top right).

Policy propagates within minutes to an online Chromebook (or on next sign-in).
Students will see OroQ appear; the **Remove** option is greyed out.

## 2. Scope correctly (students vs staff)
- Apply the **Force install** policy to the **Students** OU only.
- For the **Staff** OU, either don't add it, or set it to **"Allow install"** so
  teachers can opt in. This keeps staff devices clean and avoids over-blocking.

## 3. Verify on a device
1. Sign into a student Chromebook (or an account in the Students OU).
2. Go to `chrome://extensions` → confirm OroQ is present and **"Installed by your
   administrator"** with no enabled/remove toggle.
3. Visit a known-blocked category page → confirm OroQ blocks it.
4. `chrome://policy` → **Reload policies** → confirm `ExtensionInstallForcelist`
   contains the OroQ ID.

---

## 4. Central configuration (relay URL, locking) — needs one OroQ build step
You can push settings to every device via **Managed configuration** so students
never enter a pairing/relay URL and can't change it:

- In the OroQ row (step 1), expand **Policy for extensions** and paste a JSON like:
  ```json
  { "pairingRelayUrl": "https://<your-oroq-relay>", "pairingRelayLocked": true }
  ```

> ⚠️ **Prerequisite (OroQ side):** for `chrome.storage.managed` to deliver these,
> the extension must declare a **`managed_schema`** in its manifest
> (`"storage": { "managed_schema": "managed_schema.json" }`) and ship that schema.
> As of this writing the OroQ extension does **not** declare one, so a pushed
> policy is ignored. Until that ships, use **§1 force-install only** (which works
> today); add the managed schema to enable central config. *(Tracked as a Tier-2
> finish item.)*

---

## 5. (Optional, advanced) Make it truly bypass-proof
Force-install stops removal, but a determined student could try another browser or
DNS tricks. On a managed fleet you can close those too, via the same Admin Console:

- **Block other browsers / unmanaged sign-in:** Chromebooks run Chrome only; ensure
  students can't add a personal Google account (Devices → Chrome → Settings →
  **Sign-in restriction** to your domain).
- **Force Secure DNS to a filtering resolver** and **prevent students changing it**
  (Devices → Chrome → Settings → **DNS** / built-in `DnsOverHttpsMode`), so DNS
  filtering holds even outside the extension.
- **Disable Incognito / Guest** mode (Settings → Security) so policies always apply.
- **Disable Developer mode** on the devices (so the extension can't be sideloaded
  around).

This combination = the "managed = bypass-proof" enforcement OroQ relies on.

---

## Troubleshooting
| Symptom | Fix |
|---|---|
| Extension didn't appear | Device offline / wrong OU. `chrome://policy` → Reload; confirm the account is in the OU the policy targets. |
| Student can remove it | Policy is "Allow install", not **Force install**. Re-check step 5. |
| Pushed config ignored | Expected until OroQ ships a `managed_schema` (§4). |
| Wrong devices got it | Policy applied to a parent OU — move it to the **Students** OU specifically. |

## Engineering prerequisites (OroQ side, for a clean rollout)
1. **Publish to the Chrome Web Store** (Unlisted/Private to domain) to get a stable
   Extension ID — *or* add a fixed `"key"` to the manifest for a deterministic ID.
2. **Add `storage.managed_schema`** + the schema file to enable central config (§4).

Both are small, Tier-2 "finish" items. Force-install (§1–§3, §5) works **today**
once the extension has a Web Store ID.
