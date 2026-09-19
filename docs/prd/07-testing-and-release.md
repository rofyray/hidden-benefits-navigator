# Testing, evaluations and release operations

## Testing policy from the supplied guidelines

The aim is not to avoid ever running the full suite. Make full-suite runs a reliable scheduled regression safety net, not a mandatory blocker on every small change. Most tests should be fast unit tests, followed by fewer API/integration tests and a small set of critical browser journeys. Tests must verify behavior and failure recovery rather than mirror internal implementation.

| Stage | Required scope |
|---|---|
| While coding | Changed tests and nearby unit tests |
| Before commit / review | Changed-module tests, affected integrations, lint, typecheck, small critical smoke suite |
| Pull-request CI | Impacted unit/integration tests plus critical-path tests and static checks |
| Merge to main | Broader impacted integration checks |
| Nightly / release candidate | Full unit, integration, E2E, cross-browser and regression |
| Before risky refactor or release | Full suite even if recently run |

Shared contracts, normalization, catalog selection, API client, routing, design components, permissions and deployment changes require tests for every dependent area. If dependency mapping is unclear, run the full relevant suite. Affected selection is a speed optimization and must be paired with scheduled full runs.

## Commands to implement in P1-01/P3-10

Use one package manager and document the selected commands in the repository. The following script names are the stable contract; implement them rather than inventing success output when a command does not exist.

| Command | Meaning |
|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Static correctness and production bundle |
| `pnpm test:changed -- <base-ref>` | Dependency-aware selection; include uncommitted files; fail clearly on missing base |
| `pnpm test:unit` | Pure rules, parsing, components, state logic |
| `pnpm test:integration` | Route/schema/provider/catalog boundary tests |
| `pnpm test:smoke` | Tagged `critical` browser journeys, target <5 minutes in CI |
| `pnpm test:e2e` | Small complete browser set using deterministic provider fixtures |
| `pnpm test:full` | All preceding functional suites plus configured cross-browser regression |
| `pnpm test:eval` | Labeled extraction/Jev/verification evaluation; mock by default, live requires explicit flag |
| `pnpm data:validate` / `pnpm data:links` | Catalog semantics and reviewed official link reachability report |

Use `unit`, `integration`, `e2e`, `critical`/`smoke`, and `regression` tags/directories. Parallelize independent test files in CI; isolate clocks, catalogs and storage. No ordering-dependent browser sessions. Scheduled tests may mock cloud inference for repeatability; separately run small live contract/evaluation checks on release candidates. Do not consume paid inference for every edit.

## Required coverage matrix

| Area | Test inputs | Assertion / layer |
|---|---|---|
| Money | Monthly/annual/weekly/biweekly/semimonthly, intervals, zero, negative, boundary cents | Correct conversion, invalid input rejection, uncertain overlaps; unit |
| Source selection | Effective-date boundary, expired table, future rule, jurisdiction mismatch, wrong tax year | No stale/future/cross-state rule promotion; unit |
| SNAP | Older/disabled exceptions, food vs dwelling household, unknown deductions | No blanket gross-threshold exclusion; unit + catalog fixtures |
| EITC | No earned income, wrong tax year, childless age, separate-filing exception, dependent vs qualifying child | Correct rule/referral path; unit |
| CEAP | Unknown utility payer, missing county, unavailable funding, unsupported local provider | Honest state finder/partial result; unit/integration |
| Medicare | Under-65 enrollee, resources unknown, QMB/SLMB boundaries, Extra Help separate path | No age-only exclusion or rule merging; unit |
| WIC | Child age boundary, pregnancy/postpartum/breastfeeding categories, categorical income pathway | Correct screen, agency assessment remains; unit |
| Lifeline | Participation vs app-predicted eligibility, existing discount, economic household | No duplicate-benefit guarantee or false enrollment; unit |
| Jev policy | High-confidence negative score, low-confidence positive, missing Noul, model mismatch | Fail safely and preserve semantic distinctions; unit/integration |
| Verification | Invented amount/document/deadline/URL, contradictory evidence, unsupported “required” wording | Rejected/replaced before visible or spoken; integration |
| Route integrity | Extra fields, arbitrary questions/rules, tampered/expired token, mismatched catalog | Reject; server uses its own evidence; integration |
| Privacy | Names/SSNs in transcript, explanation contamination, cloud declined | No local-mode raw text in outbound requests or logs; integration + browser interception |
| Failures | 401/422/429/529, timeout, offline, invalid JSON, cancellation/reset | Correct retries, labeled fallbacks, no stale UI overwrite; integration |
| Interface | Text/voice review, unknown answers, no match, all six cards, checkboxes, mode/theme changes | Intentional behavior and preserved data; component + browser |
| Speech | Denied mic, missing pack/voice, repeated final results, interrupted playback | State/lifecycle unit tests plus actual-device manual checks |

## Fixtures and model evaluation

Create synthetic-only fixtures under `tests/fixtures`. Each includes ID, catalog version, input facts/narrative, expected criterion statuses, acceptable label set, must-not-show claims, expected privacy mode, and source IDs. Do not snapshot a model answer and call that ground truth.

Minimum initial deterministic bank: six cases per program (clear positive screening path, clear exclusion where supported, missing fact, threshold boundary, exception, stale source), plus six shared failure/privacy cases = 42 cases. Reuse a case only when its assertions separately cover each applicable program. Add income boundary ±1 cent as parameterized cases. These counts are coverage targets, not statistical accuracy claims.

For model evaluation, maintain a development set of at least 24 labeled situations and a held-out set of at least 12. Include every program, ambiguous language, injection, negation, numbers, and both negative and positive cases. Label expected facts and evidence support independently of model outputs. Report exact case counts, confusion counts, false-strong-match cases, uncertain/abstention share, extraction field accuracy and verifier false accepts/rejects. Do not claim calibration from this small set.

Require zero false strong matches and zero unsupported-claim false accepts on the seeded release-blocking cases. If a model fails, revise questions/policy or use reviewed fallback; do not weaken expected answers to match it. Repeat a subset three times to expose variance. Store only synthetic responses with model/version/timestamp and label recorded replays visibly. A model-version change invalidates the previous evaluation approval.

## Critical browser journeys

1. Typed parent intake → review → one clarification → all-six evaluation → WIC/other cards → check item → official link (intercept navigation; no submission).
2. Older-adult input → Medicare uncertainty → useful sourced referral → playback control state; actual audio checked manually.
3. Local AI unavailable → guided form → Jev unavailable → clearly labeled rules results.
4. Malicious/unsupported explanation → rejected before DOM/audio → curated fallback.
5. Edit/reset during in-flight request → cancellation → no old results or data; both themes and narrow viewport.
6. EITC tax-year and CEAP utility-help paths → correct routes and program-specific uncertainty.

Chromium verifies the full supported app shell with model/speech stubs. Firefox/WebKit verify typed/manual fallback, layout and navigation. Genuine Nano/on-device speech tests run on the prepared supported Chrome device; do not assert unsupported browsers ran local AI. Automated speech mocks establish control logic only.

## CI, maintenance and logs

Run lint/typecheck, selected tests, critical smoke, catalog validation and secret/client-bundle scanning on PRs. A change to catalog/common schemas/normalization/route security triggers all program tests. Nightly executes full regression and a link-check report; distinguish transient HTTP failures from confirmed broken destinations. Add a release job requiring full regression, model eval evidence and manual device/a11y signoff.

Track flaky tests with owner and issue; quarantine only noncritical tests with explicit reason and alternate coverage. Critical privacy, evidence and unsafe-claim tests cannot be waived as flaky. Avoid redundant browser tests for pure math. Record suite duration to keep feedback short.

Runtime telemetry is content-free: route latency, outcome code, active mode, catalog/model versions and counts. Never include request bodies, token contents, transcript, facts, generated explanation or provider error bodies in logs or analytics. A diagnostic screenshot/network capture used for evidence must contain only synthetic inputs.

## Deployment and rollback

Build a client asset bundle plus same-origin Node server for a host supporting HTTPS and server environment variables. Configure request limits, provider egress allowlist, timeout/concurrency, CSP for self-hosted assets, no-store API headers and permissions for local microphone/AI where required. Verify policy names against the actual browser; do not ship a guessed header that blocks capability probes. No service worker is needed for v1; do not promise offline first-load support.

Provision server secrets; run a tiny synthetic live Jev request; check no key in browser assets. Deploy a preview, verify all six application destinations and the device setup on that origin, then record the immutable build/catalog/prompt/policy/model versions. If a live provider or rule change breaks checks, switch explicitly to reviewed rules/referral mode or roll back code and catalog together. Do not roll back to expired benefit rules just because the code build is known good.

## Release evidence and demo

The release gate task requires checked evidence for: six reviewed program entries, full regression, model evaluation, actual local voice/Nano exercise, typed/manual fallback, light/dark contrast and keyboard pass, source freshness, no personal network leakage, preview deployment smoke, known limitations, and rollback instructions. A missing credential/device/source is a real blocker for the relevant claim, not a passing test.

Demo under four minutes: introduce a synthetic persona and the navigation problem; speak intake; show correction/uncertainty handling; show sourced result and checklist; tap Play; briefly explain that local speech/Nano handle narrative and the thin server sends limited details and draft text to Jev. Show six-program scope accurately. Use a typed second persona when room noise interferes. Rehearse twice. Only use the brief's impact statistics publicly after independently checking their cited originals; the application does not depend on those statistics.
