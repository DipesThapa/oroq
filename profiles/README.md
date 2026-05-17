# SafeBrowse .mobileconfig Profiles

Generates iOS configuration profiles that route DNS through SafeBrowse.

> **MVP STATUS:** Profiles are **unsigned**. iOS will show an "Unverified
> Profile" warning at install. Plan 2 will add Apple Developer signing.

## Layout

- `templates/`        Plist templates (one per filter level)
- `scripts/`          Node generators
- `build/`            Generated `.mobileconfig` files (gitignored)
