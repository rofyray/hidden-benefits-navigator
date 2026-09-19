# Sources, assumptions and requirement traceability

## How source instructions were used

The user's direct request is to create detailed, linked Markdown PRD files with checkable tasks and a sensible three-phase structure. The subsequent direct clarification requires **all six programs** and confirms Jev receives explanations through the thin server route. Those requests govern this deliverable.

The attached brief, testing guidelines, Jev reference, pasted planning text and added architecture image are design/reference material. Their embedded implementation instructions inform the specification; they were not treated as authorization to deploy an app, submit benefit applications, install unrelated tools, send messages, or expose the pasted key. Conflicts were resolved explicitly in [product decisions](01-product-and-decisions.md). No live inference request was made while writing this PRD.

## Supplied sources read

| Source | Material used | Limitations / resolution |
|---|---|---|
| `hidden-benefits-navigator-brief-2.pdf`, all 7 pages | Purpose, local-first cascade, six-program list, roles, timeline, personas/demo, fallback risks | Six-program direct instruction supersedes four-program timebox; privacy/verification tension resolved explicitly |
| `hidden-benefits-navigator-architecture.png` | Spoken/typed branching, Nano extraction, missing-field loop, Jev judgments/ranking, confidence tiers, Nano explanation/checklist, Jev verification, results/playback | Diagram omits server box but legend specifies it; PRD makes server boundary explicit. Footer's fields-only wording is superseded by explanation transmission clarification |
| `jev-system-one-reference.md`, full reference | Typed primitives, state, API shape, model pinning, errors, failure modes, confidence caveats | Some SDK signatures were marked unverified; PRD uses documented HTTP rather than inventing SDK calls |
| `test-suite-design-guidelines.md`, full file | Layered tests, impact selection, CI/full-suite cadence, tags and speed practices | Adapted to no-auth/no-payments app, with critical privacy/benefit-rule paths |
| Pasted planning request | Detailed agent-ready PRD, linked files, reference snippets, Nature light/dark theme and stronger primary | Secret excluded; CSS retained, Tailwind mapping optional for chosen baseline |

## Live sources checked September 19, 2026

Sources are evidence for documented API shapes and the data-authoring seeds. They do not replace the implementation-time review gates.

| Source | Status and intended use |
|---|---|
| [TypeSafe API](https://docs.typesafe.ai/api) | Read; HTTP request/answer shape and error behavior |
| [TypeSafe models](https://docs.typesafe.ai/models) | Read; versioning/pinning reference |
| [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api) | Read; available/setup/text/schema/abort lifecycle; page updated Aug 26, 2026 |
| [Web Speech usage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API) | Read relevant local speech sections; feature-detect and test actual implementation |
| [Speech voice localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService) | Read; local-voice selection |
| [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) | Accessibility target reference |
| [Nature gallery](https://21st.dev/@serafimcloud/themes/nature) | Opened, limited extractable content; user's pasted CSS is the design source |
| [Texas SNAP tables](https://fhb.hhs.texas.gov/handbooks/texas-works-handbook/c-120-supplemental-nutrition-assistance-program) | Retrieved official table, dated Oct 1, 2025; imminent 2026 transition must be checked |
| [SNAP overview](https://www.hhs.texas.gov/services/food/snap-food-benefits) | 403 in research tool; document/application claims not verified from this page |
| [IRS EITC rules](https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/who-qualifies-for-the-earned-income-tax-credit-eitc) | Read; basic and special-case structure |
| [IRS EITC tables](https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/earned-income-and-earned-income-tax-credit-eitc-tables) | Read; retrieved 2025 tax-year data; not a 2026 eligibility table |
| [TDHCA CEAP](https://www.tdhca.texas.gov/comprehensive-energy-assistance-program-ceap) | Read; Texas administration, plan/guideline links |
| [Help for Texans](https://www.tdhca.texas.gov/help-for-texans) | Read; provider finder, capacity caveat, local application route |
| [CEAP income guidelines](https://www.tdhca.texas.gov/community-affairs-income-guidelines) | 403; numeric rules require later official verification |
| [Texas MSP handbook](https://fhb.hhs.texas.gov/handbooks/medicaid-elderly-people-disabilities-handbook/appendix-ix-medicare-savings-program-information) | Read; subprogram distinctions and March 2026 amounts; June revision metadata |
| [Medicare Extra Help](https://www.medicare.gov/basics/costs/help/drug-costs) | Read; separate pathway; mixed year-specific sections require claim-level dates |
| [SSA Extra Help](https://www.ssa.gov/medicare/part-d-extra-help) | Opened/read application entry; source preparation specifics during program task |
| [Texas WIC apply](https://www.texaswic.org/apply) | Retrieved official categories/documents/table; table effective period not captured |
| [Texas WIC resources](https://texaswic.org/about-wic/resources) | Retrieved official Your Texas Benefits referral context |
| [USAC qualify](https://www.lifelinesupport.org/how-to-qualify/) | Retrieved 2026 income/participation rules |
| [USAC FAQ](https://www.lifelinesupport.org/faqs/) | Retrieved service-specific discount distinctions |
| [USAC state-routing brochure](https://www.lifelinesupport.org/wp-content/uploads/documents/community-education/StatePUC-Brochure.pdf) | Retrieved Texas-specific routing reference; recheck current state process |
| [Texas Lifeline](https://www.texaslifeline.org/) | Opened, no extractable form content; requires browser check before release |

## Decisions still requiring implementation evidence

Texas-first is a planning assumption tied to the event context. Technology stack, initial thresholds, timeouts, concurrency and performance targets are PRD choices, not vendor promises. All six program source packets must be completed and reviewed during Phase 1. Public eligibility guidance cannot ship from unverified draft tables. Cloud provider model/retention and hosting configuration must be verified when selected; local/manual mode is available without them.

The provided key was not tested and is not embedded in these files. Actual supported Chrome hardware and installed local language/model assets were not tested for this document-writing task. Source-derived program figures are explicitly dated seeds; no personally applicable benefit estimate has been made.

## Requirement → task mapping

| Requirement / brief feature | Primary tasks | Acceptance source |
|---|---|---|
| R01 voice-first and text | P3-02, P3-03, P3-04 | Design and speech lifecycle |
| R02 local extraction/review | P2-01, P2-02, P2-03 | Schemas, review and privacy checks |
| R03 source-grounded matching | P1-03 through P1-10 | Data quality gate |
| R04 Jev judgment + ranking | P1-11 through P1-14, P1-16 | Jev policy/evaluation |
| R05 explanation + checklist verification | P1-15, P2-06, P2-07, P3-05 | Rejected drafts never displayed/spoken |
| R06 local/cloud privacy | P1-14, P2-09, P2-10, P3-07 | Payload/storage/log assertions |
| R07 fallbacks | P1-02, P2-08, P2-09, P3-07 | Capability/outage matrix |
| R08 Nature + accessibility | P3-01, P3-06, P3-08 | Light/dark, local playback, manual a11y |
| R09 freshness | P1-03 through P1-10, P1-17, P3-12 | Effective-date and source gates |
| R10 efficient one-task loop/testing | P1-01, P3-09, P3-10, all parent checkboxes | Agent protocol and layered testing |
| R11 six-program demo | P3-11, P3-13, P3-14 | Live device evidence and rehearsal |
| R12 all six initial programs | P1-04 SNAP; P1-05 EITC; P1-06 CEAP; P1-07 Medicare help; P1-08 WIC; P1-09 Lifeline | P1-17 and P3-14 gates |
| Thin server handles Jev inputs/outputs | P1-11 through P1-15, P2-05, P2-07 | Typed evaluate/verify routes |
| No generation by Jev | P2-06 generates; P1-15 verifies | Jev transport schema |
| One-tap audio after verification | P2-07, P3-06 | Playback uses approved visible text |
| Spanish stretch | Outside required queue | Explicit later scope and translation-quality review |

## PRD completion vs app completion

These Markdown documents are complete planning deliverables. Every implementation checkbox intentionally remains unchecked. Link validation and consistency review of the PRD do not mean the app's tests passed. The implementing agent must produce the specified data, code, evaluations and release evidence before changing those checkboxes.
