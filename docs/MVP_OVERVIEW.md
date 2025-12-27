# Safeguard MVP Overview

This document explains the minimum viable product (MVP) behavior of the Safeguard (SafeBrowse AI) browser extension.

## What it is
Safeguard is a privacy-first safety extension that runs entirely on-device. It blocks unsafe pages, blurs risky media in aggressive mode, and provides parent/teacher controls without sending browsing data to any server.

## MVP goals
- Reduce exposure to unsafe content using local heuristics and blocklists.
- Provide clear, child-friendly explanations when blocking occurs.
- Give guardians and teachers quick controls and oversight inside the popup.
- Keep all decisions, logs, and sensitive data on-device.

## Core components
- Popup UI: control center for settings, profiles, and policy lists.
- Content script: scans pages and enforces page-level blocking/blur decisions.
- Background service worker: builds and maintains network blocking rules and timers.
- Local storage: persists settings, lists, and logs on-device only.

## Primary user journeys
1) Parent/teacher enables protection in the popup.
2) User visits a page:
   - If domain matches blocklist or policy rules, it is blocked at the network level.
   - If the page appears risky via on-page heuristics, Safeguard blocks or blurs content.
3) If blocked, the interstitial explains why and offers a timed override (PIN required if enabled).
4) Guardian reviews override log and exports a weekly safeguarding digest (optional).

## What is NOT in the MVP
- Server-side analytics or cloud policy management.
- Account logins or remote admin dashboards.
- Cross-device syncing.
- External data collection beyond optional HTTPS webhooks (alerts only).

