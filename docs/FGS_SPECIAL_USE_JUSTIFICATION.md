# OroQ — `FOREGROUND_SERVICE_SPECIAL_USE` justification

Two foreground services declare `android:foregroundServiceType="specialUse"`.
Google reviews every `specialUse` declaration manually and **rejects it if a
standard FGS type fits**. This document is the evidence pack: the paste-ready
Play Console text, the type-by-type elimination that proves no standard type
applies, and the rebuttal to the pushback reviewers usually send.

Source of truth in code (`app/src/main/AndroidManifest.xml`):

| Service | Declared type | `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` |
|---|---|---|
| `vpn.OroQVpnService` | `specialUse` | `On-device parental DNS filtering` |
| `monitor.AppMonitorService` | `specialUse` | `On-device app blocking and screen-time limits` |

Both call `startForeground(...)` on start and are (re)started at boot by
`boot.BootReceiver`. Neither has a standard-type equivalent — see below.

---

## 1. Play Console declaration text (paste verbatim)

**App content → Foreground service permissions → for each service.**

### `OroQVpnService` — subtype "On-device parental DNS filtering"

> This foreground service runs OroQ's on-device DNS filter. It establishes a
> local `VpnService` that captures only DNS queries and resolves them against an
> on-device blocklist to enforce parental web filtering (adult, malware,
> phishing and similar categories). It does **not** route, proxy, inspect, log,
> or transmit the user's network traffic off the device — no remote VPN server
> exists. The service must run continuously and visibly for the entire time
> protection is enabled, because filtering that can be silently killed is not
> safe for a child-protection product; the child device shows a persistent
> "protected" status while it runs. No standard foreground-service type
> describes an on-device DNS content filter: it is not `dataSync` (nothing is
> synchronised to a server), not `connectedDevice` (no external device is
> involved), and not `mediaProjection`, `location`, `camera`, `microphone`,
> `phoneCall`, `health`, or `mediaPlayback`. `specialUse` is therefore the only
> accurate type.

### `AppMonitorService` — subtype "On-device app blocking and screen-time limits"

> This foreground service enforces app blocking and screen-time limits set by
> the parent. While active it checks which app is in the foreground and blocks
> disallowed apps or apps that have exceeded their daily limit, entirely on the
> device. It must run continuously while limits are enabled, because enforcement
> that stops when the process is killed would let a child bypass every limit by
> waiting for the service to die. No standard foreground-service type describes
> local parental app-blocking / screen-time enforcement: it is not `dataSync`,
> `connectedDevice`, `mediaProjection`, `location`, `camera`, `microphone`,
> `phoneCall`, `health`, or `mediaPlayback`. `specialUse` is the only accurate
> type.

---

## 2. Why no standard FGS type fits (elimination matrix)

Android 14+ standard FGS types, and why each is wrong for **both** services:

| Standard type | Intended for | Applies here? |
|---|---|---|
| `dataSync` | Uploading/downloading/syncing data to a network endpoint | **No.** Filtering and enforcement are fully on-device; the DNS filter never sends queries or logs off-device, and the monitor syncs nothing. (Encrypted family sync is a *separate* WorkManager job, not these services.) |
| `connectedDevice` | Interacting with an external/companion device (BLE, wearable, car) | **No.** No external device is involved; both services act on the phone they run on. |
| `mediaProjection` | Screen capture / recording | **No.** Nothing is captured or recorded. |
| `mediaPlayback` | Playing audio/video in the background | **No.** |
| `location` | Continuous location access | **No.** OroQ requests no location. |
| `camera` / `microphone` | Background camera/mic use | **No.** |
| `phoneCall` | Ongoing call handling (telecom) | **No.** |
| `health` | Health/fitness sensors | **No.** |
| `remoteMessaging` | Transferring messages between devices | **No.** |
| `shortService` | A brief (<3 min) task that must finish | **No.** Protection is always-on, not short-lived. |
| `systemExempted` | Reserved for specific system/enterprise cases | **No.** Not grantable to a consumer parental-control app of this kind. |
| `specialUse` | Legitimate long-running use not covered above | **Yes.** On-device DNS content filtering and on-device app/screen-time enforcement are exactly the "no other type fits" case this bucket exists for. |

---

## 3. Anticipated reviewer pushback → rebuttal

**"Use `dataSync` instead."**
> The service performs no data synchronisation. DNS queries are resolved locally
> and never leave the device; the monitor writes only to on-device storage.
> `dataSync` would misrepresent the service's behaviour. OroQ's actual sync is a
> distinct WorkManager task, not a foreground service.

**"Use `connectedDevice`."**
> No companion or external device is present. The parent and child run separate
> installs that communicate through the backend, not via a device-to-device
> foreground connection; the enforcement services operate solely on their own
> device.

**"Does this need to be a foreground service at all / could it be periodic?"**
> Yes, continuous. A child-safety filter or limit that only runs periodically —
> or that Android can silently kill under Doze — creates windows where a child
> reaches blocked content or exceeds limits. Continuous, user-visible operation
> is the core, advertised function; the persistent notification is a feature,
> not a workaround.

**"This looks like covert monitoring / stalkerware."**
> It is transparent parental control, not covert monitoring. The child device
> shows persistent "protected" status, the parent sets everything up, and no
> browsing history or covert data is collected (see `PRIVACY_ANDROID.md`,
> `KCSIE_COMPLIANCE_MATRIX.md`). This is the sanctioned parental-control use, not
> the prohibited surveillance use.

---

## 4. If Google still rejects (honest fallback ladder)

There is **no clean type-swap** — the standard types genuinely don't fit, so
"just change the type" would be a misdeclaration and is the wrong move. In
priority order:

1. **Reply with this document + a demo video** showing the persistent
   protection status and a live block. Reviewers frequently approve on the
   second pass once behaviour is demonstrated. (Google often asks for a video
   for VPN/`specialUse` apps — record one pre-emptively: 20–40s, child device,
   show the ongoing notification and a blocked page.)
2. **Tighten the subtype strings** if asked — keep them literal and
   behaviour-describing (already done).
3. **Last resort, architectural (degrades product):**
   - *Monitor service*: app-blocking can technically be driven by an
     Accessibility Service instead of a persistent FGS — but Google's
     Accessibility API policy is *stricter* than `specialUse` for this purpose
     and risks a worse rejection. Not recommended.
   - *VPN service*: the local `VpnService` is intrinsic to on-device DNS
     filtering; it cannot be removed without dropping the feature. If VPN-based
     filtering is refused outright, the fallback is `declarativeNetRequest`-style
     filtering inside a browser extension only (i.e. the OroQ extension, not the
     Android app) — a real feature loss, to be treated as a last resort.

Keep all correspondence with review in one thread and reference this file.

---

## 5. Consistency checklist before submitting

- [ ] Manifest still declares `specialUse` + a literal subtype for both services
      (matches §Source of truth above).
- [ ] `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_SPECIAL_USE` permissions present.
- [ ] Demo video recorded (child device: persistent notification + a live block).
- [ ] Data safety form states on-device processing, no browsing data collected.
- [ ] This file linked from `PLAY_CONSOLE_CHECKLIST.md` §2.
