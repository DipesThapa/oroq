# Safeguard MVP User Flows

This document outlines the MVP flows the UI/UX designer should cover.

## 1) First-run onboarding (parent/teacher)
- Open popup.
- Toggle protection ON; status badge shows Active.
- Run Family setup wizard.
- Select an age profile (Kids/Teens/College/Work).
- Optionally set a PIN to protect overrides.
- Optionally enable Focus/Classroom mode defaults.

## 2) Normal browsing (student/child)
- User navigates to a site.
- If it matches a blocklist or policy rule, the page is blocked.
- If heuristics detect risky content, page is blurred or blocked.
- Interstitial explains why and suggests safer options.
- “Show anyway” override is available; if PIN required, it prompts for a PIN.

## 3) Parent/teacher oversight
- Open Parent mode in the popup.
- Review logs: overrides, access requests, kid reports.
- Adjust allowlist/blocklist as needed.
- Export weekly safeguarding digest (CSV).

## 4) Focus/Classroom session
- Parent/teacher starts Focus or Classroom mode.
- Distraction sites blocked; approved learning sites allowed.
- Classroom mode locks overrides and YouTube playlists only (if configured).

## 5) Alerts (optional)
- Guardian enables HTTPS webhook.
- Tamper alert triggers if extension is disabled or offline.
- Override alert triggers when a protected override is used.

## 6) Access request
- When blocked, a user requests access from the interstitial.
- Parent reviews access requests in Parent mode.
- Parent approves or denies; approvals update allowlist/temporary rules.

