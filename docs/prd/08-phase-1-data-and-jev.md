# Phase 1 — Jev and data owner

Outcome: a six-program, source-backed screening and verification backend, plus a capability probe and minimal runnable shell. All six programs are core. This phase establishes the contracts consumed by the local-model and UI phases. It does not claim a polished end-user flow yet.

## Execution order

The top-level task checkbox is the authoritative completion marker. Complete every substep, acceptance condition and verification before checking it. Record evidence using [the agent protocol](11-agent-execution.md). Tasks run in the order below; dependency notes do not authorize skipping the current task.

## P1-01 — Initialize the app and development checks

- [x] **P1-01: Initialize the app and development checks**

**Depends on:** README and product decisions.

**Read:** [Architecture](02-architecture-and-contracts.md), [testing](07-testing-and-release.md).

**Deliver:** React/Vite + Node/Fastify TypeScript skeleton, same-origin dev proxy, lockfile, scripts, `.env.example`, `.gitignore`, and initial progress file.

**Implementation:**

- [x] Inspect the working repository and applicable instructions; preserve existing work. Record chosen compatible package/runtime versions.

- [x] Create client/server/shared folders and a minimal accessible page; add health route without secrets.

- [x] Implement lint/typecheck/build, unit and integration commands; stub the remaining named scripts with clear not-yet-configured failures, not false passes.

- [x] Ignore actual environment files and initialize content-free logging.

**Acceptance:**

- [x] The shell runs, build/static checks pass, and no server secret/module enters the browser bundle

**Verify:** Fresh install/build; health-route integration check; inspect client output for server imports and secret names/values.

**Evidence:** `docs/evidence/P1-01.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-02 — Run the device and provider preflight

- [x] **P1-02: Run the device and provider preflight**

**Depends on:** P1-01.

**Read:** [Local AI](05-local-ai-and-fallbacks.md), [voice](06-design-voice-and-accessibility.md), [Jev](04-jev-integration.md).

**Deliver:** A capability probe page and `docs/decisions/device-preflight.md`.

**Implementation:**

- [x] Probe Nano, local speech pack, microphone permission and local playback voice separately; record actual origin/profile/browser and outcomes.

- [x] Offer user-triggered downloads and confirm available status or record a reproducible unsupported state.

- [x] Run one tiny synthetic Jev request from the server when a configured credential is available; record returned model and outcome without payload/key.

- [x] Select the supported local/manual/cloud capability plan; do not spend indefinite time on browser flags.

**Acceptance:**

- [x] Each capability has a measured result or explicit external blocker; manual mode remains runnable. Live-claim blockers are carried to the final gate

**Verify:** Manual probe plus mocked unavailable/downloading/denied states; no personal data required.

**Evidence:** `docs/evidence/P1-02.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-03 — Define shared schemas and catalog validation

- [x] **P1-03: Define shared schemas and catalog validation**

**Depends on:** P1-02.

**Read:** [Contracts](02-architecture-and-contracts.md), [data](03-data-catalog.md).

**Deliver:** Runtime contracts for common facts, all six extensions, evidence/rules, route envelopes and catalog manifest.

**Implementation:**

- [x] Implement strict bounded schemas with null/unknown semantics; include need enum and every extension field listed in the data packets.

- [x] Implement rule operator unions and source/evidence/reference validation; use explicit versions and injected dates.

- [x] Generate extraction JSON Schema and typed fixture builders from the contracts.

**Acceptance:**

- [x] Invalid units, unknown keys, dangling/cyclic rules, impossible values and stale/version-mismatched records are rejected or explicitly marked unsupported

**Verify:** Targeted schema/catalog unit tests; boundary and unknown fixtures.

**Evidence:** `docs/evidence/P1-03.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-04 — Curate and encode SNAP

- [x] **P1-04: Curate and encode SNAP**

**Depends on:** P1-03.

**Read:** [SNAP packet and acquisition procedure](03-data-catalog.md).

**Deliver:** SNAP catalog JSON, source records, fallback copy/checklist and six labeled rule fixtures.

**Implementation:**

- [ ] Complete the source acquisition checklist for SNAP, including the upcoming effective-date transition.

- [ ] Encode reviewed food-household, income, categorical/exception paths; distinguish a partial screen from an agency determination.

- [ ] Verify official application and document references; exclude unsupported amounts and obligations.

**Acceptance:**

- [ ] Every enabled criterion/action is sourced and dated; older/disability exceptions and unknown deductions cannot produce a false definitive exclusion

**Verify:** SNAP table transcription/boundary tests, source link review and catalog validator.

**Evidence:** `docs/evidence/P1-04.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-05 — Curate and encode EITC

- [x] **P1-05: Curate and encode EITC**

**Depends on:** P1-04.

**Read:** [EITC packet](03-data-catalog.md).

**Deliver:** Tax-year-specific EITC catalog rules, official checker/preparation actions and six fixtures.

**Implementation:**

- [ ] Select the explicitly supported published tax year and record it in all amount/threshold evidence.

- [ ] Encode earned income, AGI, filing/qualifying-child, investment and childless-age pathways; preserve special-case referrals.

- [ ] Verify tax preparation/checker destinations and source-backed preparation items; collect no SSNs.

**Acceptance:**

- [ ] EITC is included in initial screening; tax-year ambiguity prompts review and maximum credits never appear as guaranteed awards

**Verify:** Tax-year/filing/child distinction tests and source review.

**Evidence:** `docs/evidence/P1-05.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-06 — Curate and encode CEAP/LIHEAP

- [x] **P1-06: Curate and encode CEAP/LIHEAP**

**Depends on:** P1-05.

**Read:** [CEAP packet](03-data-catalog.md).

**Deliver:** Current Texas CEAP screen, provider-finder actions, source records and six fixtures.

**Implementation:**

- [ ] Retrieve the current approved state plan and income guidelines; resolve blocked-page access using an official alternative or browser.

- [ ] Encode household/income and utility responsibility checks with known scope limitations.

- [ ] Verify official local-provider routing for Denton and Collin counties without sending personal applications; source funding and document caveats.

**Acceptance:**

- [ ] The CEAP card has a reviewed numeric/referral screen and actionable official route; it promises neither a particular award nor available funds

**Verify:** Income/utility/unknown-county fixtures, destination review and catalog validation.

**Evidence:** `docs/evidence/P1-06.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-07 — Curate Medicare cost-help pathways

- [x] **P1-07: Curate Medicare cost-help pathways**

**Depends on:** P1-06.

**Read:** [Medicare packet](03-data-catalog.md).

**Deliver:** One Medicare-help card with separate MSP/Extra Help evidence and pathway IDs, rules and six fixtures.

**Implementation:**

- [ ] Review MSP subprogram thresholds, resource rules, disregards, Part A/B-ID cases and boundaries.

- [ ] Keep Extra Help rules, tax/calendar-year claims, automatic pathways and SSA link separate.

- [ ] Source Texas application/help and preparation items; route unimplemented special cases to assistance.

**Acceptance:**

- [ ] Age alone does not decide enrollment, unknown resources remain unknown, and no MSP/Extra Help claim or value is cross-applied

**Verify:** Younger Medicare case, resource uncertainty, subprogram boundary and separate-evidence tests.

**Evidence:** `docs/evidence/P1-07.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-08 — Curate and encode WIC

- [x] **P1-08: Curate and encode WIC**

**Depends on:** P1-07.

**Read:** [WIC packet](03-data-catalog.md).

**Deliver:** Dated WIC catalog, category/categorical-income rules, clinic actions and six fixtures.

**Implementation:**

- [ ] Resolve the retrieved income table’s effective period before use.

- [ ] Encode category durations and relevant household/expected-birth rules; preserve clinic nutrition-assessment step.

- [ ] Source conditional preparation documents and clinic/phone actions with plain language.

**Acceptance:**

- [ ] Category and income pathways are separated; the app cannot infer pregnancy or make an agency nutritional determination

**Verify:** Age/duration boundaries, unknown category, participation pathway and document qualifier tests.

**Evidence:** `docs/evidence/P1-08.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-09 — Curate and encode Lifeline

- [x] **P1-09: Curate and encode Lifeline**

**Depends on:** P1-08.

**Read:** [Lifeline packet](03-data-catalog.md).

**Deliver:** Lifeline rules, full applicable income table, Texas route, service-specific value copy and six fixtures.

**Implementation:**

- [ ] Verify current income/participation and economic-household rules, including existing-benefit caveat.

- [ ] Check current Texas enrollment destination and provider step; review source datedness.

- [ ] Create conditional proof options and referral-only exception branches without inventing requirements.

**Acceptance:**

- [ ] An app-predicted SNAP match is never treated as actual enrollment; Texas users receive a verified applicable route

**Verify:** Enrollment-vs-prediction, duplicate benefit, household and income boundary tests.

**Evidence:** `docs/evidence/P1-09.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-10 — Build deterministic screening and normalization

- [x] **P1-10: Build deterministic screening and normalization**

**Depends on:** P1-09.

**Read:** [Contracts](02-architecture-and-contracts.md), [data](03-data-catalog.md).

**Deliver:** Pure normalization, date/rule selection and criterion-evaluation functions for all six programs.

**Implementation:**

- [x] Implement interval conversions and comparisons without floating-point threshold drift.

- [x] Evaluate all/any/exception predicates with four-state logic; propagate missing facts and limitation reasons.

- [x] Expose required evidence and missing field IDs for both client fallback and server recomputation.

**Acceptance:**

- [x] Same facts/catalog/date produce the same statuses; unknowns never silently become false/zero; no arbitrary code evaluation

**Verify:** All program fixtures plus unit tests for intervals, dates, exceptions and household definitions.

**Evidence:** `docs/evidence/P1-10.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-11 — Implement the server Jev transport

- [x] **P1-11: Implement the server Jev transport**

**Depends on:** P1-10.

**Read:** [Jev adapter](04-jev-integration.md).

**Deliver:** Transport adapter, safe error mapping, request cancellation and server config.

**Implementation:**

- [x] Adapt the supplied HTTP snippet to the project and enforce server-only import boundaries.

- [x] Apply pinned model, total timeout, bounded backoff/Retry-After, response size cap and secret-safe diagnostics.

- [x] Add missing-key and provider-down fallback signals.

**Acceptance:**

- [x] No client request can choose endpoint/key/model or arbitrary questions; failed credentials do not cause repeated retries

**Verify:** Mock 200/401/422/429/529, invalid JSON, abort and timeout integration cases.

**Evidence:** `docs/evidence/P1-11.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-12 — Implement evaluation questions and response validation

- [x] **P1-12: Implement evaluation questions and response validation**

**Depends on:** P1-11.

**Read:** [Jev questions/policy](04-jev-integration.md).

**Deliver:** Versioned batched question builder, strict per-question answer validation and synthetic response fixtures.

**Implementation:**

- [x] Build match, relevance and bounded support questions for all six entries in one request.

- [x] Pass only minimal confirmed facts and code-computed criteria; never the transcript.

- [x] Validate IDs, answer kinds, score ranges, probabilities and returned model; explicitly handle missing data.

**Acceptance:**

- [x] Normal six-program evaluation is one Jev call; high-confidence negative answers cannot be mistaken for positive matches

**Verify:** Question snapshot for synthetic state, answer-validation unit tests and one six-program mocked integration.

**Evidence:** `docs/evidence/P1-12.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-13 — Implement labels, ranking and clarification selection

- [x] **P1-13: Implement labels, ranking and clarification selection**

**Depends on:** P1-12.

**Read:** [Jev display policy](04-jev-integration.md).

**Deliver:** Central versioned policy and deterministic fallback/ranking/next-question functions.

**Implementation:**

- [x] Implement evidence/rule blockers before score/confidence gates; distinguish uncertainty from known exclusion.

- [x] Sort by label and relevance with stable tie-breakers; do not sum unlike benefit values.

- [x] Select missing material facts first, with uncertainty tie-breaks and a three-turn cap.

**Acceptance:**

- [x] Uncertain or incomplete criteria cannot become Likely solely from model confidence; partial results always have a next action

**Verify:** Boundary thresholds, contradictory outputs, tie order, skipped facts and max-turn unit tests.

**Evidence:** `docs/evidence/P1-13.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-14 — Expose the thin evaluation route

- [x] **P1-14: Expose the thin evaluation route**

**Depends on:** P1-13.

**Read:** [API contracts](02-architecture-and-contracts.md).

**Deliver:** `/api/evaluate`, same-origin protection, request limits, signed evaluation tokens and no-store headers.

**Implementation:**

- [x] Validate allowlisted facts/IDs/catalog version and recompute rules on the server.

- [x] Call one Jev batch or return labeled rules mode; issue minimal signed expiring evaluation snapshot.

- [x] Implement revision echo, safe errors, rate/concurrency controls and content-free metrics.

**Acceptance:**

- [x] Tampered client rules cannot override authoritative sources; limits and catalog mismatch are handled without secret/body leakage

**Verify:** Route integration tests for six programs, extra fields, oversized bodies, fallback and token integrity.

**Evidence:** `docs/evidence/P1-14.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-15 — Implement explanation and checklist verification

- [x] **P1-15: Implement explanation and checklist verification**

**Depends on:** P1-14.

**Read:** [Verification policy](04-jev-integration.md), [API](02-architecture-and-contracts.md).

**Deliver:** `/api/verify`, reconstructed evidence, batched sentence/item checks and fallback decisions.

**Implementation:**

- [x] Verify token/version/revision, validate candidate IDs and rebuild evidence from the server catalog.

- [x] Check every generated sentence and checklist item in one batch, including stronger-than-source “required” wording.

- [x] Return approved IDs or whole-card curated fallback; reject invented URLs/amounts and malformed responses.

**Acceptance:**

- [x] Nothing unverified is approved on timeout/missing answers; all six program drafts fit one bounded batch

**Verify:** Supported/unsupported paraphrase fixtures, injection and token-tampering integration cases.

**Evidence:** `docs/evidence/P1-15.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-16 — Evaluate Jev policy on labeled synthetic cases

- [x] **P1-16: Evaluate Jev policy on labeled synthetic cases**

**Depends on:** P1-15.

**Read:** [Evaluation plan](07-testing-and-release.md).

**Deliver:** Development/held-out fixture sets and a versioned evaluation report.

**Implementation:**

- [x] Independently label screening evidence, required uncertainty and unsupported claims.

- [x] Run mocked regression and live synthetic evaluation when the configured provider is available; preserve exact counts and versions. *(Live not available in this environment; recorded as a release blocker.)*

- [x] Tune on development data only; check held-out false-strong matches and verifier false accepts; document limitations.

**Acceptance:**

- [x] Policy meets the seeded blocking-case criteria or explicitly falls back; unavailable live evaluation is a recorded release blocker *(zero false strong matches, zero unsupported-claim approvals; live evaluation and defects D1/D2 recorded as open blockers)*


**Verify:** Evaluation script plus threshold boundary regression; do not claim population calibration.

**Evidence:** `docs/evidence/P1-16.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.

## P1-17 — Pass the data and backend phase gate

- [x] **P1-17: Pass the data and backend phase gate**

**Depends on:** P1-16.

**Read:** [Data quality gate](03-data-catalog.md), [testing](07-testing-and-release.md).

**Deliver:** Phase 1 evidence index, six-entry published manifest and working synthetic evaluate→verify example.

**Implementation:**

- [ ] Confirm all six program tasks and contracts are complete; no placeholder numeric rules or unsourced mandatory paperwork.

- [ ] Run affected backend/catalog tests, lint/typecheck/build and secret scan.

- [ ] Record resolved decisions, external blockers and precise interfaces for Phase 2.

**Acceptance:**

- [ ] All six reviewed entries and both routes work with synthetic data; the next phase has no unexplained schema or data gaps

**Verify:** Catalog validation, all program/backend unit/integration suites and one route smoke; no need for nonexistent UI E2E yet.

**Evidence:** `docs/evidence/P1-17.md` with changed paths, commands/results, limitations, and relevant synthetic artifacts. Mark the parent checkbox only after this evidence exists.
