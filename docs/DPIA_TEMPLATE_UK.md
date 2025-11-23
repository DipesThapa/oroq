# Safeguard (SafeBrowse AI) DPIA Template – UK Schools

> Draft for use by DSLs, Data Protection Officers, and IT leads. Adapt to your setting and merge with existing GDPR documentation.

## How to use this template
1. Make a copy into your safeguarding/IG toolkit.  
2. Replace angled bracket placeholders (`<...>`) with local details.  
3. Attach supporting evidence (e.g., KCSIE matrix, Prevent briefing, screenshots).  
4. Share with your DPO for review and sign-off; keep version history in your DPIA register.

## 1. Project overview
- **Product**: Safeguard (SafeBrowse AI) Chrome extension  
- **Purpose**: Provide client-side filtering and safeguarding controls to reduce exposure to explicit or extremist content.  
- **Controller**: \<School/Trust name\>  
- **Processor(s)**: None – extension processes data locally on the device; no vendor-operated backend.  
- **Implementation lead**: \<Name/role\>  
- **Date**: \<dd/mm/yyyy\>

## 2. Describe the processing
| Activity | Data involved | Source | Storage/location | Notes |
| --- | --- | --- | --- | --- |
| Page analysis for heuristics | Page DOM text, metadata, media previews (transient) | User’s active Chrome tab | RAM only; no persistent storage | Processed locally, discarded after decision. |
| Domain filtering | Domain names in allow/block lists | Pre-packaged list, user-supplied CSV/JSON | Chrome storage (local/sync) | Lists contain domains only, no personal data. |
| Override control (PIN) | PIN hash, salt, iteration count | Stored locally by admin | Chrome storage (local) | Uses PBKDF2 hashing; no plaintext PIN stored. |
| Metrics display | Counts of allowlist/blocklist entries | Chrome storage | Popup UI only | Not exported unless admin downloads list. |

## 3. Lawful basis & necessity
- **Lawful basis**: Public task (maintaining a safe learning environment) or legitimate interest (for independent schools).  
- **Necessity & proportionality**: Provide justification for why client-side filtering is required alongside any network controls. Note that processing stays on-device and avoids sharing browsing data with third parties.

## 4. Risk assessment
| Risk | Impact | Likelihood | Mitigation | Residual risk |
| --- | --- | --- | --- | --- |
| Overblocking impedes teaching | Medium | Medium | Allowlist workflow with PIN oversight; sensitivity tuning per age group. | Low |
| Underblocking due to new extremist sites | High | Medium | Maintain supplementary Prevent lists; schedule reviews. | Medium |
| PIN compromise leading to misuse | Medium | Low | Restrict PIN to DSL/SLT; rotate termly; enable approver prompt and local override logging. | Low |
| Inadequate audit trail for inspectors | Medium | Medium | Use Safeguard override log (download termly) and retain exported policy lists. | Low/Medium |
| Accessibility barriers (screen readers) | Low | Medium | Test with ChromeVox/JAWS; document user guidance. | Low |

## 5. Consultation
- **Safeguarding team/DSL** – date & outcome  
- **IT services or managed provider** – date & outcome  
- **Pupils/parents (if consulted)** – optional notes  
- **Data Protection Officer** – sign-off details

## 6. Approval & review
- **Approving officer**: \<Name, role\>  
- **Review cycle**: Recommend annual review or upon major release (e.g., v0.4+).  
- **Related documents**: Safeguard KCSIE matrix, Prevent briefing, Acceptable Use Policy, Incident response plan.

## 7. Actions / enhancements
- [ ] Import Prevent keyword pack once available.  
- [ ] Enable override reason capture / logs (planned feature).  
- [ ] Attach evidence of staff training on Safeguard usage.  
- [ ] Update privacy notice to reference client-side filtering tool.

> For questions or community templates, visit the project repo: https://github.com/DipesThapa/safebrowse-ai.
