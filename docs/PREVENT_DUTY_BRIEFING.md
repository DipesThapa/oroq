# Safeguard & the Prevent Duty – Briefing Note (Draft)

Audience: Designated Safeguarding Leads (DSLs), Prevent leads, senior leadership  
Version: Draft – 0.3.0 (extension), 2025-02-14

## Purpose
Summarise how Safeguard (SafeBrowse AI) contributes to your organisation’s compliance with the Prevent Duty (Counter-Terrorism and Security Act 2015) and outline recommended operational practices.

## Safeguard capabilities relevant to Prevent
- **Domain filtering** – packaged blocklist covering known adult/illicit domains; can be extended with locally maintained lists (e.g., extremist sites supplied by LA or third-party feeds).
- **Heuristic page analysis** – detects risky keywords/metadata even when domains are unknown, enabling interstitial blocks or media blurring.
- **SafeSearch enforcement** – forces Google and Bing into strict SafeSearch, reducing exposure to extremist propaganda in search results.
- **On-device processing** – all detection happens locally; no user browsing data leaves the machine, minimising data sharing risk while remaining effective offline/remote.
- **PIN-controlled overrides** – override requests require a PIN (0.3.0), ensuring adults approve access and log a rationale for safeguarding review.
- **Age-based profiles** – presets for EYFS through post-16 quickly apply age-appropriate defaults that align with UK safeguarding tiers.

## Recommended operational controls
1. **Define ownership** – assign a Prevent lead (often the DSL) who controls the override PIN and reviews requests.  
2. **Curate Prevent-specific lists** – import extremist keyword or domain feeds from trusted sources (e.g., UK Safer Internet Centre, local authority). Record provenance and review frequency.  
3. **Document override workflow** – capture who authorised a bypass, the reason (lesson content, research project), and follow-up actions. Until built-in logging ships, use your safeguarding logbook or MIS notes.  
4. **Monitor effectiveness** – schedule termly reviews of block/allow metrics plus any incidents flagged by staff or students.  
5. **Educate staff and learners** – brief staff that Safeguard blocks extremist content and instruct them on how to escalate concerns. Signpost pupils to CEOP/Childline reporting routes in your digital citizenship curriculum.  
6. **Review network layers** – Safeguard complements (not replaces) ISP or firewall filtering. Ensure overlaps don’t create blind spots (e.g., whitelisted domains bypassing upstream filters).

### Quick checklist for DSLs
- [ ] Insert Safeguard into your Prevent risk assessment, with owner and review cadence.  
- [ ] Log the personnel who hold the override PIN (typically DSL + deputy).  
- [ ] Enable the “Require approver name” prompt and review the override log (or MIS sync) capturing date/time/reason/approver for each override.  
- [ ] Schedule a calendar reminder (termly) to refresh Prevent domain/keyword feeds.  
- [ ] Update staff briefing pack to mention Safeguard’s PIN process and escalation route.  
- [ ] Verify interstitial/footer includes Childline (0800 1111) and CEOP reporting links.

## Evidence for inspectors (Ofsted/ISI)
- Keep this briefing note, the KCSIE matrix, and your override logs in the safeguarding evidence file.  
- Demonstrate the PIN override flow live to inspectors.  
- Provide screenshots of SafeSearch enforcement and the interstitial warning screens.  
- Reference Safeguard in your Prevent risk assessment, noting its on-device nature and minimal data processing.

## Planned enhancements (Q2–Q3 2025 roadmap)
- Optional Prevent keyword pack curated with UK partners.  
- CSV/PDF export formats for the override log and scheduled safeguarding digests.  
- Configurable interstitial footer linking to CEOP, Childline, and your school’s safeguarding helpline.

For collaboration or feedback, open a Prevent-tagged issue or discussion on GitHub: https://github.com/DipesThapa/safebrowse-ai.
