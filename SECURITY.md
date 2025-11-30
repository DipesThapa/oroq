# Security Policy

- **Reporting**: Please report suspected vulnerabilities privately via GitHub Security Advisories or the contact in `SUPPORT.md`. Do not open public issues for exploitable bugs.
- **Acknowledgement & timelines**: We aim to triage within 3 business days and publish fixes as patch releases (manifest version bump) after validation. Credit is given in release notes unless you request otherwise.
- **Architecture highlights**:
  - No backend: all analysis runs on-device; no browsing data is sent to our servers.
  - PINs are stored as PBKDF2 hashes with salt/iterations; override/tamper webhooks are HTTPS-only and reject localhost/LAN/credentialed URLs.
  - Override logs are encrypted at rest (AES-GCM with per-install key) and exclude full URLs; webhook URLs and settings remain local.
  - Dynamic rules and regexes sanitize user inputs before registering DNR policies.
- **Hardening expectations**: Keep Chrome up to date, review permissions at install, and rotate any shared credentials. If you distribute managed builds, sign the published zip and verify hashes before deployment.
