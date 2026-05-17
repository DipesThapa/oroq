# SafeBrowse Landing Site

Static landing site for the SafeBrowse DoH service. Vanilla HTML/CSS/JS.

## Layout

- `public/`           Static assets served by Cloudflare Pages
  - `index.html`      Main install portal (3-step flow)
  - `verify.html`     Verification page
  - `privacy.html`    Privacy policy
  - `terms.html`      Terms of service
  - `assets/`         CSS + JS
  - `profiles/`       Generated `.mobileconfig` files (copied from ../profiles/build/)

## Dev quick start

```bash
cd landing
npm install
npm run build:profiles    # generates the 3 unsigned .mobileconfig files
npm run dev               # serves on http://localhost:8788
```

Open http://localhost:8788 in a browser to see the landing site.

## Tests

```bash
npm test
```

Unit tests cover platform detection and verify-page logic using jsdom.
