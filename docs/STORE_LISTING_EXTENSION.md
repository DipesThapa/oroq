# Chrome Web Store Listing — OroQ (repositioned)

Positioning: **privacy-first self-control + focus blocker** that also works as an
on-device safe-browsing filter. NOT sold as "remote parental control" or
"KCSIE filtering & monitoring" — the extension is a local filter; those claims
are not honest for a removable, single-browser extension.

Primary buyers: adults blocking themselves (porn/gambling/doomscroll recovery),
students/knowledge-workers managing focus, and anyone who wants a private, safe
browser. Category: **Productivity**.

---

## Name
OroQ — Website Blocker & Focus

(Drop "SafeBrowse AI". No AI model ships; "AI" in the name is a misleading-claims
risk and dilutes the self-control/focus angle.)

## Short description (132 char max)
Block distracting or adult sites, force SafeSearch, lock it with a PIN. Private, on-device, one-click Focus Mode for deep work.

## Category
Productivity

---

## Full description

**Take back control of your browser — privately.**

OroQ blocks the sites you don't want to see and locks the setting behind a PIN so a moment of weak willpower can't undo it. Everything runs on your device. Nothing you browse is ever sent to a server, logged in the cloud, or shared with anyone.

**What it does**

• **Block by category** — over 500,000 adult, gambling, and drug domains blocked at the network layer, before the page loads. Not a flimsy overlay you can click past.
• **Focus Mode** — one click blocks social media, gaming, and streaming for a set session (30/45/60 min). A visible countdown keeps you honest. Ideal for study, deep work, or homework.
• **PIN lock** — protect your settings with a PIN. Give it to a friend, or set one you won't recall in the moment, so you can't disable the block on impulse. This is the difference between a reminder and a real commitment device.
• **SafeSearch enforced** — Google and Bing are automatically forced into strict SafeSearch and can't be switched off while OroQ is on.
• **Blocks DNS bypass** — OroQ blocks the DNS-over-HTTPS resolvers that people use to sneak around filters, and steers your browser to a safe resolver.
• **Smart content check** — an on-device scan flags pages whose content looks explicit even when the domain isn't on any list. Purely local — no images or page text ever leave your browser.
• **Your own allowlist** — always want a site available? Add it. You're in charge.

**Private by design**

OroQ has no accounts, no sign-in, no analytics, and no servers. Your settings live in your browser's own storage. We can't see what you block, what you browse, or that you use OroQ at all — because none of it reaches us. If you're blocking things you'd rather keep private, that's exactly the point.

**Who it's for**

• Anyone building better habits — cutting out adult content, gambling, or endless scrolling.
• Students and remote workers who need to focus.
• Anyone who simply wants a cleaner, safer browser.

**Honest about limits**

OroQ protects the browser it's installed in. A determined user can disable any Chrome extension — so OroQ works best when *you* want it to. For managed devices (schools, shared/public computers), OroQ can be force-installed by an administrator via Chrome Enterprise policy so it can't be turned off.

---

## Permission justifications (paste into Privacy practices tab)

- **storage** — Save your settings, block/allowlist, PIN, and Focus Mode state locally on your device. No data leaves the device.
- **declarativeNetRequest** — Block harmful/distracting domains and redirect Google/Bing to SafeSearch, without reading the contents of your requests.
- **tabs** — Read the active tab's URL to show block status in the popup and apply Focus Mode to open tabs. No browsing history is collected or transmitted.
- **alarms** — Run the Focus Mode countdown reliably in the background service worker.
- **privacy** — Enforce browser-level SafeSearch and steer DNS to a safe resolver so filtering can't be trivially bypassed.

Single purpose: "An on-device website blocker and focus tool that filters harmful or distracting sites and enforces SafeSearch, controlled locally by the user or a device administrator."

Remote code: **No** (all scripts bundled; no eval, no remote scripts).
Data collected/transmitted: **None**.

---

## Migration notes (this is an UPDATE, not a new listing)

- Existing item: "Safeguard (SafeBrowse AI)", id `iobhgfobljjbooffdeeeloplokcakgla`, publisher CyberHeroez CIC. Keep the listing (retains 468 installs + history); change name + copy, upload new zip.
- Rename removes "AI"; the on-device-AI claims are gone from the code (heuristics only) so the listing and product now match.
- Family pairing removed from the extension — do NOT reference cross-device/parent-approval in the copy. Cross-device family control lives in the Android app only.
- Screenshots (1280×800): interstitial (blocked page), Focus Mode countdown, blocked gambling/adult page, popup with PIN + allowlist.
