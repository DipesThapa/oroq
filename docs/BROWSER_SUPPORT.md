# Browser support

Safeguard is built as a Chrome/Chromium WebExtension (Manifest V3) and ships with a Firefox build (Manifest V2) for easier local installs on macOS laptops.

## Chromium browsers (Chrome, Edge, Brave, Vivaldi, Opera)

Load unpacked:
1. Open your browser’s extensions page:
   - Chrome/Brave/Vivaldi/Opera: `chrome://extensions`
   - Edge: `edge://extensions`
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the project root folder (contains `manifest.json`).

Optional build/zip:
- `npm run build:chromium` → outputs `dist/chromium/`
- `npm run zip:chromium` → outputs `dist/chromium.zip`

## Firefox (macOS)

Firefox needs a Manifest V2 build folder.

Build:
- `npm run build:firefox` → outputs `dist/firefox/`

Load temporarily (dev):
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `dist/firefox/manifest.json`

Note: for permanent distribution, Firefox requires signing via AMO.

## Safari (macOS)

Safari requires converting the extension into a Safari App Extension (Xcode project).

1. Build the Chromium folder: `npm run build:chromium`
2. Convert:
   - `xcrun safari-web-extension-converter dist/chromium --project-location safari/SafeguardSafari --app-name Safeguard --bundle-identifier uk.co.cyberheroez.safeguard`
3. Open the generated Xcode project and run it to install the extension in Safari.

## Feature parity notes

- Chromium browsers use `declarativeNetRequest` for pre-navigation blocking and SafeSearch redirects.
- Firefox/Safari still run the same content script protections; SafeSearch + Focus Mode are enforced by the content script as a cross-browser fallback.

## Device pairing relay

Cross-device approvals require an **HTTPS relay** (the extension will not accept `http://` or localhost/LAN).

- Dev: run `node relay/server.js` and expose it via an HTTPS tunnel.
- Production: deploy a relay (Cloudflare Workers example in `relay/cloudflare/README.md`).
