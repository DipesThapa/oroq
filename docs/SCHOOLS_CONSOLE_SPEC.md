# OroQ Schools Console — Scope & Spec

_Tier-2 "OroQ for schools" build. Status: scoping. Owner: TBD._
_Companion to [PRODUCT_STRATEGY.md](PRODUCT_STRATEGY.md) and [CHROMEBOOK_DEPLOYMENT.md](CHROMEBOOK_DEPLOYMENT.md)._

The web console a **MAT / school** uses to assign OroQ safeguarding profiles,
review flagged events, and produce compliance reports — the surface that turns
OroQ from a deployed extension into a **sellable schools product**.

---

## 0. The gating decision: the privacy model
A safeguarding console that shows *"student X tried to reach self-harm content"*
is **monitoring tied to a named student** — the **opposite** of OroQ's consumer
end-to-end / zero-retention model.

- **Consumer (app):** E2E encrypted; the server can't read activity. **Unchanged.**
- **Schools (console):** events are **school-readable**, tagged with the student's
  **Google Workspace identity**, retained for the school. This is **lawful and
  expected** in schools (KCSIE requires "appropriate monitoring"; the school is the
  data controller). But it is a **deliberate, documented divergence** — a *second
  data plane*, not an extension of the E2E one.

**Required before building:** sign-off that the school is the data controller,
a DPIA, a lawful-basis + retention note, and clear in-product transparency to
students (OroQ is never covert). **Everything below depends on this sign-off.**

---

## 1. Personas
| Persona | Primary job |
|---|---|
| **MAT / School IT admin** | Assign profiles to schools/year-groups (OUs), manage rollout & licensing |
| **DSL / Safeguarding Lead** | Review & triage flagged events; export reports for safeguarding meetings & Ofsted |
| **Teacher** (light, later) | Classroom / per-class view |

## 2. Identity (a simplification vs consumer)
Schools run **Google Workspace for Education**. The Chromebook + extension already
run under the student's **managed Google account**, so:
- The extension can **tag every event with the Workspace email automatically** — no
  passphrase/familyId pairing (the whole consumer pairing subsystem is *removed* for
  schools).
- Console users sign in via **Google SSO**, validated against the trust's domain(s)
  + an assigned role.

## 3. Feature scope by tier

### MVP — enough to run a lighthouse MAT pilot
- Google **Workspace SSO**; domain + role check.
- **Event ingestion:** extension in "school mode" POSTs serious-category block
  events (self-harm, suicide, extremism/Prevent, adult, CSAM-adjacent) → backend,
  tagged with student email + school/OU + timestamp + category + domain.
- **Flagged-events dashboard:** filter by school / category / date; **triage**
  (acknowledge, add a note).
- **CSV / PDF export** for safeguarding meetings.
- **Multi-tenant:** MAT → schools; role-based (IT admin vs DSL).
- **Basic profile assignment:** which category-set applies to which OU.

### V1 — sellable
- Full **profile management** + central config push (managed policy + backend).
- **KCSIE / Prevent report templates.**
- **Audit trail** (who viewed / actioned what — safeguarding requires this).
- **Escalation workflow** (assign to staff; status open → actioned → closed).
- Per-school dashboards + trends.

### V2 — scale
- MAT-level rollups + benchmarking.
- **Alerting** (email/Teams to DSL on serious flags).
- **Integrations** with existing safeguarding systems (CPOMS, MyConcern) — feed
  flags in rather than replace them.

## 4. Build vs integrate (don't over-build)
Schools already run CPOMS / MyConcern / Smoothwall / Securly. **Don't try to be
CPOMS.** Position the MVP as *"OroQ surfaces the flags and exports/feeds your
existing safeguarding system,"* not *"replace it."* Smaller build, easier sale,
no head-on fight with incumbents.

## 5. Architecture
```
Student Chromebook (OroQ extension, school mode)
   │  serious-category block event, tagged with Workspace email
   ▼
Cloudflare Worker (extend the existing, hardened backend)
   │  new SCHOOL-READABLE schema (NOT the E2E tables)
   ├── ingest API (Workspace-token authed)
   ├── reporting / export API
   └── D1: trusts, schools, ous, users, events, profiles, audit
   ▲
Console web app (new) — React + Google SSO
   dashboards · triage · reports · profile/config admin · RBAC
```
- **Reuse** the hardened Cloudflare Worker + D1 (you own it) — **new tables**, not
  the E2E ones.
- **Extension change:** detect "managed/school mode" (force-installed + managed
  policy present, builds on the shipped `managed_schema`) → report events to the
  school backend with the Workspace identity; apply the OU's assigned profile.
- **Console:** new SPA; can reuse styling/components from the app/extension UI.

## 6. Data model sketch (D1, school plane)
```sql
trusts        (id, name, primary_domain, created_at)
schools       (id, trust_id, name, urn, created_at)           -- URN = DfE school id
profiles      (id, trust_id, name, categories_json, locked, created_at)
ou_profiles   (ou_path, school_id, profile_id)                -- which OU gets which profile
users         (email, trust_id, role)                         -- console users: ADMIN | DSL | TEACHER
events        (id, school_id, ou_path, student_email, ts,
               category, domain, type, severity)              -- the safeguarding flags
triage        (event_id, status, assignee_email, note, updated_by, updated_at)
audit         (id, actor_email, action, target, ts)           -- append-only
```
Retention policy per trust (e.g. auto-purge events after N months) lives here too.

## 7. MVP user stories (hand to a dev)
1. As a **DSL**, I sign in with my school Google account and only see my trust's data.
2. As an **IT admin**, I see the MAT → schools tree and assign a profile to an OU.
3. The **extension** (school mode) reports a serious-category block to the backend
   tagged with the student's Workspace email, school, OU, category, domain, time.
4. As a **DSL**, I see a list of flagged events, filter by school/category/date.
5. As a **DSL**, I open an event, add a note, and mark it acknowledged.
6. As a **DSL**, I export the filtered list as CSV/PDF for our safeguarding meeting.
7. As any user, my role limits what I can see/do (DSL can't change billing; IT can't
   read individual student notes — TBD per trust policy).

## 8. Screen sketches (MVP)
```
┌─ OroQ Schools ─────────────── ▸ Oakwood MAT ▾   DSL: a.khan@oakwood ─┐
│  Schools ▾  [All] Greenfield Pri  Oakwood Sec  …                      │
│  Flagged events            Category ▾  Date ▾   [ Export CSV ]        │
│ ───────────────────────────────────────────────────────────────────  │
│  ● self-harm   j.smith@…   selfharm-forum.x    2m ago   [ open ]      │
│  ● prevent     a.lee@…     extremist-blog.x    1h ago   [ ack ✓ ]     │
│  ● adult       (year 7)    xxx-tube.x          3h ago   [ open ]      │
│  ○ adult       (year 9)    popups.x            1d ago   [ ack ✓ ]     │
└──────────────────────────────────────────────────────────────────────┘

┌─ Event ───────────────────────────────────────────────────────────── ┐
│  self-harm · selfharm-forum.x · blocked                               │
│  Student: j.smith@oakwood.sch.uk   School: Oakwood Sec   Year 8       │
│  When: 14:32, 24 Jun 2026                                             │
│  Note: [ Spoke with form tutor; flagged to pastoral.            ]     │
│  Status: ( ) Open   (•) Acknowledged   ( ) Closed     [ Save ]        │
└──────────────────────────────────────────────────────────────────────┘
```

## 9. Effort (honest ranges, one strong full-stack dev)
| Phase | Scope | Estimate |
|---|---|---|
| **MVP** | SSO + ingest + flagged dashboard + triage + CSV + basic multi-tenant | **~6–10 wk** |
| ↳ backend (multi-tenant + ingest) | | ~3–4 wk |
| ↳ extension school-mode reporting | (builds on `managed_schema` ✓) | ~1–2 wk |
| ↳ console frontend (MVP) | | ~3–4 wk |
| **V1** | + profiles, reports, audit, escalation | **+6–10 wk** |

**MVP ≈ 2–2.5 months · V1 ≈ 4–5 months.** Faster with a team or by reusing UI.

## 10. Risks
- **Privacy/compliance (highest):** the school data plane needs DPIA + lawful basis
  + retention + student transparency. Get sign-off first.
- **Scope creep into "CPOMS":** resist; surface-and-export, not replace.
- **Two data planes:** keep the school-readable tables strictly separate from the
  E2E consumer ones — never blur them.
- **Workspace SSO + domain mapping edge cases** (multi-domain trusts, sub-OUs).

## 11. Open decisions (need sign-off to start)
1. **School data model** (monitoring tied to student identity; school = controller; DPIA). *Gating.*
2. **Build-vs-integrate:** surface-and-export (recommended) vs full platform.
3. **Backend:** extend the Cloudflare Worker + D1 (recommended) vs the extension's Firestore.
4. **MVP cut:** agree §3 MVP / the §7 stories for the pilot?

## 12. Recommended pilot cut (thinnest valuable slice)
1. Workspace SSO + MAT→school multi-tenant + DSL role.
2. Extension reports serious-category flags (Workspace-tagged).
3. One flagged-events dashboard with filter + triage.
4. CSV export for the safeguarding meeting.

Profiles, audit, Prevent templates, escalation → **V1, after the pilot proves demand.**
