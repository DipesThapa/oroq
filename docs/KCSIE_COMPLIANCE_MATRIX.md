# Safeguard & KCSIE Alignment (Draft)

Audience: Designated Safeguarding Leads (DSLs), governors, IT managers  
Version: Draft – 0.3.0 (extension), 2025-02-14

This matrix summarises how Safeguard (SafeBrowse AI) supports the statutory *Keeping Children Safe in Education* (KCSIE) 2024 expectations for “filters and monitoring” in schools and colleges in England. Use it as an annex to your safeguarding policy. Complete the “Action for your school” column with local owners and review dates. Highlighted gaps are areas we plan to enhance – see the roadmap column.

| KCSIE expectation | Safeguard coverage | Action for your school | Evidencing tips | Roadmap / gaps |
| --- | --- | --- | --- | --- |
| **Appropriate filtering systems in place** <br> (Part 2, paras 141–144) | Packaged adult-domain blocklist, heuristic content analysis, SafeSearch enforcement via Declarative Net Request (Google/Bing). | Note who enables protection by default and how devices are provisioned (e.g., Chrome policy). | Document default settings (Protection toggle, Aggressive mode). Keep screenshots of popup status and policy counts. | Add age-based presets and Prevent keyword pack. |
| **Filtering is proportionate and age appropriate** | Sensitivity slider, aggressive mode toggle, and age-based profiles (EYFS–post-16) let DSLs tune strictness per cohort. | Decide sensitivity per age group; record who reviews allowlist additions. | Record chosen sensitivity for each bubble/year group in safeguarding minutes. | Add trust-level preset editor and sharing between schools. |
| **Leadership understands filtering limitations** | README + docs explain scope (no off-device coverage, cross-origin video limits). Popup shows live metrics and host overrides. | Brief governors/SLT annually using this document and attach minutes. | Present this matrix at governor/SLT meeting; minute acceptance. | Produce governor briefing slide deck; add override reason logging. |
| **Regular review of filtering effectiveness** | Metrics (allowlist/blocked counts) visible in popup; blocklist exports support audits. | Schedule termly review meeting with DSL + IT; capture notes in safeguarding log. | Export blocklist/allowlist, note any manual overrides with PIN logs. | Build scheduled safeguarding report (CSV/PDF) with override attempts. |
| **Processes to handle override requests safely** | Manual overrides gated by PIN; allowlist edits also require PIN. Override log captures reasons and approver names, with optional webhook alerts. | Assign PIN custodians; define two-step approval for curriculum exceptions. | Export/download override log termly and attach to safeguarding minutes. | Optional DSL email alerts for overrides (planned). |
| **Monitoring of online activity** | In-page heuristics blur/flag material; dynamic interstitial warns users. No persistent activity logs collected (privacy by design). | Combine Safeguard deployment with classroom monitoring/alerts; update Acceptable Use Policy accordingly. | Use “PIN required” message as evidence of adult supervision. Reference complementary logs (e.g., Google Workspace, firewall). | Optional opt-in override log stored locally/exportable for DSL review. |
| **Education on safe use, reporting pathways** | Interstitial includes guidance text; site/support.html links to privacy, support, and GitHub issues. | Add CEOP/Childline links and local reporting email to pastoral curriculum. | Show pupils the interstitial and explain reporting routes; keep lesson plans. | Provide configurable safeguarding contacts panel in UI. |
| **Compatibility with other systems (e.g., BYOD, remote learning)** | Runs client-side in Chrome/Chromium-based browsers; no accounts needed. | Document how Safeguard complements ISP filtering, MDM profiles, or VLE safeguards. | Note deployment method (Chrome enterprise policy, Google Workspace). | Explore managed profiles/templates for Chrome Device Management. |

### Supporting documents to prepare
- **Safeguard DPIA (UK template)** – complete the provided draft with local details.
- **Prevent Duty keyword coverage** – evaluate integration with UK Safer Internet Centre / IWF resources.
- **Governor briefing pack** – slides summarising technical/operational safeguards.
- **Override log export** – download termly and attach to safeguarding minutes.

For questions or to contribute feedback, open an issue or discussion at https://github.com/DipesThapa/safebrowse-ai.
