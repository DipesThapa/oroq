# Safeguard (SafeBrowse AI) — Privacy-first Web Safety Extension (MVP)

Safeguard is a lightweight, on-device browser extension that helps families and schools
reduce exposure to harmful content.

## Features
- Domain **blocklist** (`data/blocklist.json`)
- **Allowlist** managed from the popup
- Simple **keyword heuristic** scanner
- Interstitial "blocked" page with override

## Dev Setup
1. Chrome → `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Toggle **Enable protection** in the popup; edit `data/blocklist.json` to test

## Roadmap
- Interstitial v2 (reason badge + 5s delay)
- On-device small text classifier (replace keywords)
- Options page polish + export/import lists
- Chrome Web Store draft

MIT License

## Quick start
1) Load unpacked
2) Toggle Enable
3) Edit data/blocklist.json
