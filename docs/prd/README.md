# Hidden Benefits Navigator — implementation PRD

Version 1.0 · September 19, 2026 · Status: specification ready; implementation not started.

Build a voice-first, accessible benefits navigator that turns a person's situation into a small, sourced action plan. Keep intake local when the device supports it; use Jev for bounded judgments and verification; let code enforce rules, dates, permissions, and fallback behavior.

## Start here

Read this file, [product and decisions](01-product-and-decisions.md), [architecture and contracts](02-architecture-and-contracts.md), and [agent execution protocol](11-agent-execution.md). Then execute the first unchecked task in the phase files. Consult supporting specifications linked from each task. All implementation tasks start unchecked. Checking a task means its acceptance criteria passed and evidence was recorded, not merely that code was written.

| Order | Phase / owner from the brief | Outcome | Task source of truth |
|---|---|---|---|
| 1 | Jev and data owner, including initial setup | Versioned program catalog, deterministic screening, typed Jev routes and verification | [Phase 1](08-phase-1-data-and-jev.md) |
| 2 | On-device model owner | Local extraction, follow-ups, grounded explanations, explicit cloud/manual fallbacks | [Phase 2](09-phase-2-local-models.md) |
| 3 | Voice and UI owner | Accessible Nature UI, local speech and playback, integrated tests and release | [Phase 3](10-phase-3-voice-ui-and-release.md) |

These are sequential implementation phases for one agent, matching the three roles. A minimal capability probe and screen shell happen in Phase 1 to expose device problems early. UI refinement remains Phase 3. Phase gates are real tasks; finish the current task and gate before moving on. Separate people may later own modules, but this document does not authorize parallel agent execution.

## Supporting specifications

| File | Contents |
|---|---|
| [01 — Product](01-product-and-decisions.md) | Personas, scope, journeys, success criteria, conflicts resolved |
| [02 — Architecture](02-architecture-and-contracts.md) | Repository layout, state machine, schemas, API contracts, privacy boundaries |
| [03 — Data](03-data-catalog.md) | Six-program inventory, source register, rule authoring, refresh and release rules |
| [04 — Jev](04-jev-integration.md) | Server-side connection code, typed questions, gating, validation and outages |
| [05 — Local AI](05-local-ai-and-fallbacks.md) | Prompt API setup, extraction schema, prompt templates, manual/cloud paths |
| [06 — UI](06-design-voice-and-accessibility.md) | Complete supplied light/dark theme, screens, voice lifecycle, accessible behavior |
| [07 — Quality](07-testing-and-release.md) | Layered test policy, fixtures, evaluation, CI, release/runbook |
| [11 — Agent loop](11-agent-execution.md) | One-task execution prompt, progress/evidence templates, stop/resume rules |
| [12 — Sources](12-sources-and-traceability.md) | Source status, research limitations, brief-to-task mapping |

## Release scope

`v1` covers all six program cards: SNAP, EITC, Texas CEAP/LIHEAP, Medicare cost help (MSP with a separately grounded Extra Help referral), WIC, and Lifeline. Texas is a documented planning assumption based on the North Dallas/UNT Frisco brief. The app must ask state, never infer location from the browser or silently apply Texas rules elsewhere.

All six programs are mandatory for initial delivery, per the user’s clarification. The brief’s four-program timebox is superseded. Spanish output remains optional after the six-program release gate. Jev receives explanation and checklist content through the thin server route for verification, as clarified by the user and shown in the added architecture diagram.

## Definition of done

A release has a working end-to-end flow; current source-backed program entries; no unsupported generated instructions; truthful processing-mode labels; both themes; keyboard/text alternatives; working official application links; targeted development checks and a full release regression run. Device-dependent speech/Nano behavior requires an actual-device check. Mocked browser tests alone do not satisfy that gate.

No actual benefit applications, user accounts, document uploads, eligibility guarantees, or production data collection are in scope. This PRD is the deliverable for this task; it does not claim the app has been built, deployed, or validated with a live Jev key.
