# Phase 3 — voice, UI and release owner

Outcome: a polished, accessible six-program app following the supplied architecture, with local voice, verified action cards and release evidence. Do not trade away any of the six programs to satisfy the older hackathon timebox. If time is constrained, reduce decorative polish or optional Spanish work, not privacy, grounding, accessibility, or required program coverage.

## Execution order

The top-level task checkbox is the authoritative completion marker. Complete every substep, acceptance condition and verification before checking it. Record evidence using [the agent protocol](11-agent-execution.md). Tasks run in the order below; dependency notes do not authorize skipping the current task.

## P3-01 — Apply the Nature design system

- [ ] **P3-01: Apply the Nature design system**

**Depends on:** P2-11.

**Read:** [Design tokens](06-design-voice-and-accessibility.md).

**Deliver:** Self-hosted font assets, tokens, reusable form/button/card primitives and theme control.

**Implementation:**

- [ ] Use supplied CSS plus documented primary override; wire light/dark/system before first paint.

- [ ] Implement responsive layout, typography, visible focus and semantic state labels.

- [ ] Persist only theme preference and preserve active intake when switching.

**Acceptance:**

- [ ] Both themes render every primitive legibly without external font traffic; no color-only state or theme reset bug

**Verify:** Component checks, manual light/dark inspection and targeted contrast measurements.

**Evidence:** `docs/evidence/P3-01.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-02 — Build welcome, setup and intake screens

- [ ] **P3-02: Build welcome, setup and intake screens**

**Depends on:** P3-01.

**Read:** [Screens](06-design-voice-and-accessibility.md), [journey](01-product-and-decisions.md).

**Deliver:** Responsive six-program introduction, privacy/mode disclosure, setup and always-visible text intake.

**Implementation:**

- [ ] Promote speech as a primary action with visible typing alongside it.

- [ ] Show independent capability/download status and useful manual alternatives.

- [ ] Provide labeled empty/error/loading states, character limit feedback and a clear next action.

**Acceptance:**

- [ ] A first-time user can start with text immediately and understands what data is sent before proceeding

**Verify:** Component tests, keyboard path and narrow/wide layout inspection.

**Evidence:** `docs/evidence/P3-02.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-03 — Implement on-device speech capture

- [ ] **P3-03: Implement on-device speech capture**

**Depends on:** P3-02.

**Read:** [Speech lifecycle](06-design-voice-and-accessibility.md).

**Deliver:** Local recognizer hook, language-pack setup, mic controls and transcript buffers.

**Implementation:**

- [ ] Feature-detect local support, require processLocally=true, and install/check the English pack through an intentional action.

- [ ] Merge final/interim segments without duplicates; expose idle/listening/stopping/error states.

- [ ] Preserve text on denied/no-speech/audio errors, stop on page hide/reset, and never fall back to remote recognition silently.

**Acceptance:**

- [ ] Supported-device voice works without audio upload; denied or unsupported microphone paths remain fully usable by text

**Verify:** Lifecycle unit tests plus an actual-device mic/network check; record device limitations honestly.

**Evidence:** `docs/evidence/P3-03.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-04 — Polish fact review and spoken follow-ups

- [ ] **P3-04: Polish fact review and spoken follow-ups**

**Depends on:** P3-03.

**Read:** [Review/follow-up design](05-local-ai-and-fallbacks.md), [accessibility](06-design-voice-and-accessibility.md).

**Deliver:** Accessible editable facts and single-question interaction with voice/text choices.

**Implementation:**

- [ ] Render program-specific fields only when needed, with plain labels and unknown options.

- [ ] Wire spoken questions to explicit play/conversation mode and stop playback before listening.

- [ ] Manage focus after review transitions; retain corrections across speech errors.

**Acceptance:**

- [ ] A person can hear a question, answer by voice or type, skip it, and correct the interpretation without losing prior work

**Verify:** Component/keyboard tests, spoken follow-up manual check and turn-limit smoke.

**Evidence:** `docs/evidence/P3-04.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-05 — Build ranked results and actionable cards

- [ ] **P3-05: Build ranked results and actionable cards**

**Depends on:** P3-04.

**Read:** [Card contract](06-design-voice-and-accessibility.md), [policy](04-jev-integration.md).

**Deliver:** Six-program results renderer, source details, ranked cards and official application actions.

**Implementation:**

- [ ] Render approved/fallback plans only; show labels, value caveats, reasons, source date and engine mode.

- [ ] Implement session-only checklist progress with accessible checkbox labels and counts.

- [ ] Provide Other programs checked, no-clear-match, incomplete-state and stale-rule variants; keep official routes useful.

**Acceptance:**

- [ ] Every program is accounted for, application destinations come from the catalog, and no unverified text or misleading total savings is shown

**Verify:** Program/card fixtures, link allowlist tests, empty states and results browser smoke.

**Evidence:** `docs/evidence/P3-05.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-06 — Implement local tap-to-play controls

- [ ] **P3-06: Implement local tap-to-play controls**

**Depends on:** P3-05.

**Read:** [Playback](06-design-voice-and-accessibility.md).

**Deliver:** Global speech-synthesis controller, per-card Play/Stop and optional slower rate.

**Implementation:**

- [ ] Select a tested local English voice and handle delayed voice discovery or absence.

- [ ] Read exactly the visible approved plan, with label/caveats; cancel prior playback before new playback.

- [ ] Cancel on edit/reset/navigation and synchronize accessible control state with end/error callbacks.

**Acceptance:**

- [ ] No autoplay or overlapping cards; no hidden remote voice; spoken output matches approved visible text

**Verify:** Controller unit tests and manual local-voice playback in the target browser.

**Evidence:** `docs/evidence/P3-06.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-07 — Finish recovery, privacy and mobile behavior

- [ ] **P3-07: Finish recovery, privacy and mobile behavior**

**Depends on:** P3-06.

**Read:** [State machine](02-architecture-and-contracts.md), [fallbacks](05-local-ai-and-fallbacks.md).

**Deliver:** Consistent timeout/offline/reset/edit/unsupported-browser flows and truthful mode badges.

**Implementation:**

- [ ] Exercise every supported processing combination and preserve useful facts on recoverable errors.

- [ ] Ensure cloud choice/revocation, refresh and reset clear the appropriate memory and requests.

- [ ] Adapt layout for small screens and unsupported local-AI browsers without promising mobile Nano.

**Acceptance:**

- [ ] No spinner traps, silent mode switches, stale-result overwrites or accidental personal persistence

**Verify:** Recovery matrix integration tests, critical reset/privacy smoke and mobile viewport check.

**Evidence:** `docs/evidence/P3-07.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-08 — Complete the accessibility and plain-language pass

- [ ] **P3-08: Complete the accessibility and plain-language pass**

**Depends on:** P3-07.

**Read:** [Accessibility checklist](06-design-voice-and-accessibility.md).

**Deliver:** Measured light/dark contrast report, keyboard/screen-reader notes and corrected copy.

**Implementation:**

- [ ] Run automated accessibility checks and manually inspect focus/order/live-region behavior.

- [ ] Check 200% zoom, narrow reflow, reduced motion, forced colors, touch targets and both themes.

- [ ] Read every core state aloud; simplify jargon and preserve required qualifiers.

**Acceptance:**

- [ ] No known critical accessibility blocker; every spoken state has text and every action is keyboard reachable

**Verify:** Automated a11y plus one manual screen-reader and keyboard end-to-end journey.

**Evidence:** `docs/evidence/P3-08.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-09 — Add critical end-to-end and cross-browser tests

- [ ] **P3-09: Add critical end-to-end and cross-browser tests**

**Depends on:** P3-08.

**Read:** [Browser journeys](07-testing-and-release.md).

**Deliver:** Small tagged Playwright smoke/regression suites and isolated synthetic fixtures.

**Implementation:**

- [ ] Implement the six named critical journeys with provider/capability stubs where appropriate.

- [ ] Test typed/manual fallback on Firefox/WebKit and the supported shell on Chromium.

- [ ] Add assertions that rejected drafts never enter DOM/playback and request payloads match privacy mode.

**Acceptance:**

- [ ] Critical smoke is short and repeatable; actual-device coverage remains separately identified

**Verify:** Run smoke/E2E across configured browsers and remove ordering dependencies.

**Evidence:** `docs/evidence/P3-09.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-10 — Wire affected-test CI and scheduled regression

- [ ] **P3-10: Wire affected-test CI and scheduled regression**

**Depends on:** P3-09.

**Read:** [Testing policy](07-testing-and-release.md).

**Deliver:** Working test scripts, PR/main/nightly/release pipelines and dependency-change mapping.

**Implementation:**

- [ ] Replace any initial not-configured script placeholders with real commands.

- [ ] Implement affected selection with shared-package dependency expansion and a safe full-relevant fallback.

- [ ] Schedule full regression/link checks, cache dependencies, and isolate parallel jobs; document flaky-test ownership.

**Acceptance:**

- [ ] PRs cannot skip critical checks, shared changes exercise all dependents, and nightly/release full suites are real configured jobs

**Verify:** CI config validation and one representative shared-change selection test.

**Evidence:** `docs/evidence/P3-10.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-11 — Measure and improve end-to-end performance

- [ ] **P3-11: Measure and improve end-to-end performance**

**Depends on:** P3-10.

**Read:** [Targets](01-product-and-decisions.md), [timeouts](05-local-ai-and-fallbacks.md).

**Deliver:** A 20-run warmed-device latency report and bounded fallback behavior.

**Implementation:**

- [ ] Measure extraction, evaluation, generation, verification and time to usable results with synthetic inputs.

- [ ] Identify unnecessary calls/oversized state and keep six-program batch behavior intact.

- [ ] Tune concurrency/timeouts without dropping evidence checks or silently changing model/labels.

**Acceptance:**

- [ ] Targets are met or the measured limitation is explicit with a useful timeout fallback; no unsupported sub-second promise

**Verify:** Targeted performance runs and affected regression only when changes justify it.

**Evidence:** `docs/evidence/P3-11.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-12 — Prepare and verify a release deployment

- [ ] **P3-12: Prepare and verify a release deployment**

**Depends on:** P3-11.

**Read:** [Deployment runbook](07-testing-and-release.md).

**Deliver:** Build/deployment configuration, environment checklist, preview evidence and rollback instructions.

**Implementation:**

- [ ] Configure HTTPS, same-origin routes, server secrets, no-store headers, limits and content-free logs.

- [ ] Verify the deployed client bundle contains no secrets and use one synthetic live Jev request.

- [ ] Recheck device capability on the deployed origin, catalog freshness and all six official application paths; record immutable versions.

**Acceptance:**

- [ ] The preview behaves as specified and can be rolled back coherently; unavailable hosting/credentials are recorded as blockers rather than fake deployment success

**Verify:** Preview health/critical smoke, synthetic live contract and deployed network/privacy inspection.

**Evidence:** `docs/evidence/P3-12.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-13 — Rehearse the six-program demo and operating handoff

- [ ] **P3-13: Rehearse the six-program demo and operating handoff**

**Depends on:** P3-12.

**Read:** [Demo/runbook](07-testing-and-release.md).

**Deliver:** A <4-minute demo script, typed backup persona and support/maintenance notes.

**Implementation:**

- [ ] Rehearse twice with one local-voice persona and a second typed persona; include an EITC/CEAP path in supporting fixtures.

- [ ] Use privacy wording that explicitly includes draft explanations/checklists sent to Jev through the thin server.

- [ ] Document catalog refresh, provider outage response, secret rotation, model upgrades, actual limitations and rollback.

**Acceptance:**

- [ ] The demo shows real verified behavior, labels any recorded responses, and has a tested noise/network fallback

**Verify:** Two rehearsal records and manual link/playback/source checks.

**Evidence:** `docs/evidence/P3-13.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P3-14 — Pass the all-six-program release gate

- [ ] **P3-14: Pass the all-six-program release gate**

**Depends on:** P3-13.

**Read:** [Definition of done](README.md), [quality](07-testing-and-release.md).

**Deliver:** Final release report, complete requirement traceability, full test results and remaining-risk record.

**Implementation:**

- [ ] Confirm every required task is checked with evidence and every program has reviewed effective sources/rules/actions.

- [ ] Run full regression before release, held-out model checks, actual-device and accessibility signoff; resolve all blocking failures.

- [ ] Confirm live Jev thin-route verification, no raw local narrative transmission, labeled fallback, light/dark UI and deployment/rollback evidence.

**Acceptance:**

- [ ] All six programs and the full agreed pipeline are complete. Unresolved live/device/source blockers prevent claiming full release completion

**Verify:** Full unit/integration/E2E/cross-browser regression plus required manual/live evidence; record exact versions and results.

**Evidence:** `docs/evidence/P3-14.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.
