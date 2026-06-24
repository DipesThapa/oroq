# CyberHeroez / OroQ — Product Strategy

_Working strategy. Synthesised 2026-06-24. Pressure-test against a real MAT before betting the roadmap on it._

## 0. The portfolio
CyberHeroez (CIC) is building a **schools-centric cyber + digital-safety ecosystem**, with the **MAT (Multi-Academy Trust)** as the shared channel:

| Product | Buyer | Job | State |
|---|---|---|---|
| **Hero Skool** | School / MAT | ICT curriculum, coding clubs, cyber challenges, CPD, mentorship, hackathons | platform |
| **OroQ** | School / MAT (+ home) | Safeguard children online (filtering, screen-time, app control) | **finishing first** |
| **SecuraLens** | Businesses (+ schools' own IT) | M365 / cloud / DNS security audit | coming soon |

**The unlock:** one MAT relationship → sell **Hero Skool + OroQ + SecuraLens** (the trust's own IT security). GTV multiplies by *pupils per deal* **and** *products per deal*. The brand becomes a category ("our cyber & digital-safety partner"), not three point products.

**Sequence decision:** **finish OroQ first** (it's ~done → fastest to revenue + the pilot case study), then Hero Skool, then SecuraLens. **iOS last.**

---

## 1. The one insight everything rests on
**OroQ's protection is only real on *managed* devices** — anything else is bypassable, and bypassable safety is theatre. This sorts the whole market:

| Device | Managed? → enforceable | OroQ surface |
|---|---|---|
| School Chromebook | ✅ admin force-install | **Extension** (the product) |
| Android phone | ✅ device-admin | **App** (the product) |
| Home laptop | ❌ unless parent adds OS controls/DNS | OS controls + DNS; extension = light layer |
| iPhone | ❌ (no app yet) | gap — **deferred to last** |

## 2. Positioning
**OroQ is the privacy-first safeguarding layer for managed child devices** — Chromebooks at school, Android at home. On-device filtering, end-to-end encrypted activity, **no analytics**. A *safeguarding* tool for institutions with a duty, plus a trustworthy free home companion — not surveillance-ware.

## 3. Portfolio roles (each asset = one job)
- **Extension → "OroQ for Schools."** Force-deployed on managed Chromebook fleets. Its differentiated value (content-aware filtering, on-device NSFW blur, safeguarding profiles, audit/CSV, classroom mode, central config) is exactly what OS/Chromebook controls *don't* give and schools *must* have. **Revenue product.**
- **App → "OroQ at Home," distributed *through* the school.** Strong on the kid's Android phone; the E2E/zero-retention privacy is the trust anchor. **Free → zero-CAC consumer growth riding the school relationship.**
- **Backend → the shared, hardened spine.** Keep it boring and secure.

## 4. The home-laptop truth (don't oversell it)
The extension **cannot** run a VPN (browser sandbox) and is bypassable on an unmanaged laptop. The real home-laptop enforcement is **OS controls** (Microsoft Family Safety / Apple Screen Time) + optionally **device-level DNS filtering** + a standard (non-admin) child account. The extension is a *content layer* there, truly unremovable only on managed Chrome (Chromebook / local policy). The "VPN muscle" belongs to **native apps**, not extensions — a desktop app is a *much later, funded* bet, if ever.

## 5. GTV / monetisation
- **Per-pupil annual recurring**, sold to the **MAT** (one deal = thousands of seats — the multiplier).
- Land-and-expand inside the trust; statutory lock-in (KCSIE/Prevent) → durable, compounding GTV.
- Free app = funnel, not a line item.
- *Illustrative:* ~30–40 MATs (or ~1,000 schools) ≈ **£1M ARR**. Same £1M would need ~1.25M consumer installs — that's the efficiency gap.
- **Target MAT central IT + DSL/safeguarding leads, not individual head teachers.**

## 6. What we deliberately DON'T do
- ❌ Chase consumer **paid** as the engine (free OS tools + funded incumbents; low conversion, high churn).
- ❌ Build **iOS** or a native **desktop VPN** before GTV funds them — **iOS is explicitly last.**
- ❌ Sell single schools when MATs exist.
- ❌ Promise home-laptop "total protection."

## 7. "Finish OroQ" — definition of done (this is the active sprint)
**Decision: take OroQ all the way to schools-ready (Tier 1 + Tier 2). iOS last.**

### Tier 1 — OroQ is *live* (consumer-ready)
- Android app → Play Store: code ☑️ done; remaining = Play Console forms (answers in `PLAY_CONSOLE_CHECKLIST.md`), host privacy page, upload AAB + screenshots, real Resend domain, submit → review.
- Extension → Web Store: code ☑️ done (GA4 removed, OroQ icon); dists + `dist/extension.zip` ☑️ built; remaining = listing + submit, verify cross-tenant Firestore rules.

### Tier 2 — OroQ is the *schools product* (the GTV engine)
- Chromebook **force-install / managed-deployment** guide (Google Admin Console).
- Thin **admin / central-config console** + **safeguarding reporting** (override logs, CSV, KCSIE profiles surfaced centrally).
- One **lighthouse MAT pilot** → case study + quote.

## 8. Roadmap (sequenced by readiness × GTV)
1. **Now:** ship Tier 1 (app + extension live) — cheap, fast, in-market.
2. **Next:** Tier 2 schools layer (managed deploy + admin/reporting) → first MAT pilot.
3. **Then:** Hero Skool (bundle into the *same* MAT relationships).
4. **Later, funded by traction:** SecuraLens (incl. "secure your trust's IT"), then **iOS**.

## 9. Top risks → mitigation
- **Spreading thin** across products/devices → finish OroQ first, managed-only, say no loudly.
- **Long B2B cycles** → MAT central deals (fewer, bigger) + compliance wedge.
- **"Two OroQs" confusion** → in B2B, app + extension breadth is a *feature*, not confusion.

## 10. One-breath summary
**Be the privacy-first safeguarding layer for managed child devices. Win UK schools through MATs on per-pupil recurring, force-deployed on Chromebooks via the extension; give parents the free phone app, distributed by those schools. Finish OroQ first (Tier 1 live → Tier 2 schools-ready), then Hero Skool, then SecuraLens, then iOS. Never sell protection you can't enforce.**
