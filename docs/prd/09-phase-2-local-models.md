# Phase 2 — on-device model owner

Outcome: a complete browser orchestration layer that moves from local narrative or manual facts to a verified six-program plan. Implement and test with a simple development screen before final visual polish. Privacy boundaries from the user’s diagram and thin-server clarification remain authoritative.

## Execution order

The top-level task checkbox is the authoritative completion marker. Complete every substep, acceptance condition and verification before checking it. Record evidence using [the agent protocol](11-agent-execution.md). Tasks run in the order below; dependency notes do not authorize skipping the current task.

## P2-01 — Create the local model adapter

- [x] **P2-01: Create the local model adapter**

**Depends on:** P1-17.

**Read:** [Local setup](05-local-ai-and-fallbacks.md).

**Deliver:** Capability/download/session adapter with cancellation and progress events.

**Implementation:**

- [ ] Wrap availability/create/prompt/destroy behind typed interfaces and isolate browser globals.

- [ ] Handle unavailable, downloadable, downloading, ready and failure independently from speech.

- [ ] Create model sessions only through an intentional setup action; allow manual continuation.

**Acceptance:**

- [ ] Unsupported devices do not crash or stall and every active session can be cancelled/destroyed

**Verify:** Adapter unit tests and actual-device setup check if supported.

**Evidence:** `docs/evidence/P2-01.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P2-02 — Implement complete structured extraction

- [x] **P2-02: Implement complete structured extraction**

**Depends on:** P2-01.

**Read:** [Schema inventory](05-local-ai-and-fallbacks.md), [contracts](02-architecture-and-contracts.md).

**Deliver:** Common and six-program JSON schemas, prompt templates and extraction result validator.

**Implementation:**

- [x] Derive schemas from runtime contracts, including all null/unknown values and bounded extensions.

- [x] Extract common facts first and only relevant program extensions; preserve ambiguity and reject identifiers.

- [x] Bound input/output, validate parsed content, retry once if appropriate, and expose manual fallback.

**Acceptance:**

- [x] Every program receives the fields it needs or explicit unknowns; a schema-shaped hallucination is never auto-confirmed

**Verify:** Labeled extraction fixtures including negation, ambiguous amounts, time periods and injection.

**Evidence:** `docs/evidence/P2-02.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P2-03 — Build fact review and manual entry logic

- [x] **P2-03: Build fact review and manual entry logic**

**Depends on:** P2-02.

**Read:** [Journey and contracts](01-product-and-decisions.md), [local schema](05-local-ai-and-fallbacks.md).

**Deliver:** Editable fact state, origin metadata and a functional basic review/manual form.

**Implementation:**

- [x] Show proposed facts with plain labels, unknown options and relevant program-specific inputs.

- [x] Make confirmation/editing precede cloud screening; preserve manual edits over late extraction responses.

- [x] Keep narrative/source spans in memory and omit them from the network projection.

**Acceptance:**

- [x] A person can correct any inferred fact or complete the guided form without local AI

**Verify:** Component/state tests and network payload projection assertions.

**Evidence:** `docs/evidence/P2-03.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P2-04 — Implement one-question clarification

- [x] **P2-04: Implement one-question clarification**

**Depends on:** P2-03.

**Read:** [Follow-ups](05-local-ai-and-fallbacks.md), [selection](04-jev-integration.md).

**Deliver:** Question bank, turn counter and answer-to-field updates.

**Implementation:**

- [x] Use code-selected missing field IDs to choose authored plain questions.

- [x] Support typed/button answers, unknown, skip and show-options actions; preserve confirmed facts.

- [x] Re-evaluate only after meaningful changes; stop asking after three optional turns.

**Acceptance:**

- [x] One question is shown at a time and skipping never becomes a false answer or a loop

**Verify:** Missing-field, repeated-answer, skip and turn-cap unit/component tests.

**Evidence:** `docs/evidence/P2-04.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P2-05 — Connect evaluation with revision-safe orchestration

- [x] **P2-05: Connect evaluation with revision-safe orchestration**

**Depends on:** P2-04.

**Read:** [State machine/API](02-architecture-and-contracts.md).

**Deliver:** Evaluation client adapter, state transitions and invalidation/cancellation logic.

**Implementation:**

- [x] Submit only confirmed allowlisted facts and all six IDs to the thin server.

- [x] Handle catalog mismatch, signed snapshot, rules-mode response and safe recoverable errors.

- [x] Abort/ignore stale requests on edit/reset, with visible stage state.

**Acceptance:**

- [x] Only the active revision can produce results; six-program evaluation remains batched

**Verify:** Delayed-response/race/reset integration and component tests.

**Evidence:** `docs/evidence/P2-05.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P2-06 — Compose grounded explanations and checklist drafts

- [x] **P2-06: Compose grounded explanations and checklist drafts**

**Depends on:** P2-05.

**Read:** [Prompts](05-local-ai-and-fallbacks.md), [data](03-data-catalog.md).

**Deliver:** Fresh evidence-only generation sessions and strict draft schema.

**Implementation:**

- [x] Build per-card minimal evidence snapshots from selected reasons and curated action choices.

- [x] Generate short sentences and checklist wording using allowed IDs and qualifiers.

- [x] Bound local concurrency/time, reject unexpected identifiers/URLs, and select curated fallback for invalid generation.

**Acceptance:**

- [x] The intake session/history cannot contaminate generation; each draft element carries valid evidence IDs

**Verify:** Prompt assembly, schema bounds, contaminated generation and timeout tests.

**Evidence:** `docs/evidence/P2-06.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P2-07 — Gate display through server verification

- [x] **P2-07: Gate display through server verification**

**Depends on:** P2-06.

**Read:** [Jev verification](04-jev-integration.md).

**Deliver:** One batched verification call and approved/fallback plan assembler.

**Implementation:**

- [x] Send sanitized sentences/checklist text through `/api/verify` with the evaluation token.

- [x] Withhold all draft prose from DOM and playback until approved; assemble whole-card fallback when required.

- [x] Keep official values/links selected by code and expose content approval mode.

**Acceptance:**

- [x] An unsupported explanation or checklist is never seen or spoken; a failed card does not erase approved cards

**Verify:** DOM/text/playback guards, multi-card partial failure and invalid verification response tests.

**Evidence:** `docs/evidence/P2-07.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P2-08 — Complete manual and rules-only fallbacks

- [ ] **P2-08: Complete manual and rules-only fallbacks**

**Depends on:** P2-07.

**Read:** [Fallback matrix](05-local-ai-and-fallbacks.md).

**Deliver:** A usable no-Nano/no-Jev path with current local catalog and reviewed plan text.

**Implementation:**

- [ ] Route unavailable/declined model paths to the guided form without losing entered facts.

- [ ] Use shared deterministic rules when offline/provider-down, with no fabricated model confidence.

- [ ] Handle stale catalog and unsupported state with honest agency referrals.

**Acceptance:**

- [ ] Users can get useful sourced next steps without a local model or cloud-text consent; initial offline load is not promised

**Verify:** Capability/provider matrix integration tests and one typed fallback browser smoke.

**Evidence:** `docs/evidence/P2-08.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P2-09 — Implement the explicit cloud-text option

- [ ] **P2-09: Implement the explicit cloud-text option**

**Depends on:** P2-08.

**Read:** [Cloud boundaries](05-local-ai-and-fallbacks.md), [API](02-architecture-and-contracts.md).

**Deliver:** Default-off provider adapter, extract/explain routes, consent state and disclosure.

**Implementation:**

- [ ] Read the configured provider’s current official model/schema API before implementing; record model and retention assumptions.

- [ ] Use server-only credentials and the same strict output schemas; send text only after the mode choice.

- [ ] Add timeouts, validation, mode revocation/reset and guided-form recovery; preserve downstream Jev verification.

**Acceptance:**

- [ ] No cloud text is sent before consent or after revocation; absent configuration is clearly unavailable. Enabling live cloud mode requires a synthetic live check

**Verify:** Mock route tests for consent/data boundaries and schema failures; conditional live synthetic contract check.

**Evidence:** `docs/evidence/P2-09.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P2-10 — Run privacy and prompt regression checks

- [ ] **P2-10: Run privacy and prompt regression checks**

**Depends on:** P2-09.

**Read:** [Privacy](02-architecture-and-contracts.md), [quality](07-testing-and-release.md).

**Deliver:** A browser/network evidence report using only synthetic sensitive-looking inputs.

**Implementation:**

- [ ] Verify local-mode requests contain only approved projections and sanitized drafts.

- [ ] Scan logs, errors, URLs/storage and generated evidence for narrative/key leakage.

- [ ] Test prompt injection, exact-amount invention, stronger document obligations and mode transitions.

**Acceptance:**

- [ ] All seeded leakage/unsupported-claim cases are blocked or safely replaced, with tests proving the expected boundary

**Verify:** Affected privacy/integration/critical tests; inspect synthetic network trace.

**Evidence:** `docs/evidence/P2-10.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P2-11 — Pass the model and orchestration phase gate

- [ ] **P2-11: Pass the model and orchestration phase gate**

**Depends on:** P2-10.

**Read:** [Requirements](01-product-and-decisions.md), [quality](07-testing-and-release.md).

**Deliver:** A basic end-to-end six-program plan flow and Phase 2 evidence index.

**Implementation:**

- [ ] Exercise intake→review→clarify→evaluate→generate→verify→plan with synthetic fixtures.

- [ ] Check all fallback modes, program-specific fields and revision cancellation.

- [ ] Record prompt versions, latency observations and any actual-device/live-provider release blockers.

**Acceptance:**

- [ ] The pipeline works with approved output or explicit curated fallback; Phase 3 can build on stable adapters and plan contracts

**Verify:** Affected model/orchestration suites, static checks, basic typed smoke and available device checks.

**Evidence:** `docs/evidence/P2-11.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.
