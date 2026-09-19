# One-task-at-a-time agent execution

## Rules for the implementation loop

The user requested Markdown checkboxes so an implementing agent can finish one task before moving to the next. The phase files are the authoritative queue. There are 42 required tasks: P1-01 through P1-17, P2-01 through P2-11, and P3-01 through P3-14. Do not duplicate completion state in another task list.

On each iteration, read README, the progress record and the current phase. Select the first unchecked top-level task. Confirm its dependency has evidence. Read only the supporting documents needed for that task, then implement its bounded deliverables and run impact-appropriate checks. Check each substep as it is completed. Do not check the parent until every acceptance condition and required verification passes.

Immediately after completion, write the evidence record, check the parent task, update the progress record, and only then select the next task. Do not mark future work complete because a skeleton exists. Do not equate an API mock with a live-provider or actual-device check. Do not auto-check an entire phase with a search/replace operation.

If a task is blocked, leave it unchecked; record the exact blocker, attempted safe alternatives and required input/action. Stop dependent execution rather than silently skip to later tasks. The preflight task explicitly permits recording unsupported capabilities while selecting a functional fallback; that is different from a required live release check passing. An optional provider can remain disabled if its contract tests pass and the release does not claim it is enabled.

The user’s latest six-program instruction supersedes the brief’s four-program timebox. Do not cut EITC/CEAP, explanation verification, or checklist verification to finish faster. Optional enhancements such as Spanish output are outside the required queue and cannot displace required work.

## Ready-to-use implementing-agent prompt

```text
Implement Hidden Benefits Navigator from this PRD directory.
Read README.md, 01-product-and-decisions.md, 02-architecture-and-contracts.md,
and 11-agent-execution.md first. Follow applicable repository instructions.
Use the phase files as the task queue: Phase 1, then Phase 2, then Phase 3.
All six programs are required in the initial release.

For each iteration:
1. Read docs/progress/current.md and select the first unchecked task.
2. Check its dependency and read its linked requirements.
3. Implement only that task and necessary supporting fixes.
4. Run targeted checks selected by change impact. Broaden for shared or risky changes.
5. Verify all acceptance criteria, using real-device/live checks when required.
6. Write docs/evidence/<TASK-ID>.md with commands, outcomes and honest limitations.
7. Check completed substeps and the parent - [ ] box as - [x].
8. Update docs/progress/current.md before moving to the next task.

If blocked, leave the task unchecked and record the blocker. Do not invent test
results, source verification, credentials, live API responses or successful deployment.
Never persist raw voice/transcripts or expose server secrets. Use the thin server
for Jev evaluation and explanation/checklist verification. Arithmetic and dates
belong in code. Keep all low-confidence/outage modes explicit.
Finish with the six-program release gate, not just working UI scaffolding.
```

This is a loop protocol, not an instruction to run an uncontrolled infinite shell loop. A runner may start a fresh agent iteration with this prompt, but it must respect failures, user steering and resource limits. No autonomous purchases, account creation, messaging, or benefit submissions are needed.

## Progress file template

Create during P1-01 at `docs/progress/current.md` in the implementation repository:

```markdown
# Implementation progress
Current phase: 1
Current task: P1-01
Status: in_progress
Last completed task: none
Next task after acceptance: P1-02

## Current evidence
- Changed paths: …
- Checks run and results: …
- Evidence record: docs/evidence/P1-01.md

## Decisions and blockers
- Decision: …
- Blocker: none / exact missing prerequisite
- Safe fallback tried: …
- Required next action: …

## Versions
Catalog: …
Schema: …
Jev model / question / policy: …
Nano prompt version: …
```

The phase checkbox remains authoritative. If progress and checkbox disagree after interruption, inspect evidence and actual code before reconciling. Do not assume either is accurate blindly.

## Evidence record template

```markdown
# P1-01 — Task title
Status: complete / blocked / in_progress
Date: YYYY-MM-DD

## Changed
- File/path and behavior delivered

## Acceptance evidence
- Condition → command/manual observation → result
- Tests: exact command, relevant scope, pass/fail counts
- Actual-device/live checks: actual result or not performed, with reason

## Data / model versions
- Catalog hash, rule year, prompt/policy/model versions if affected

## Limitations
- None / exact remaining issue and whether it blocks acceptance

## Handoff
- Next task and relevant contract/decision
```

Use synthetic examples in evidence; never paste real transcripts, personal facts, evaluation tokens or secrets. An evidence file containing credentials is not an acceptable audit record.

## Change control and optional work

If implementation reveals a conflict, record the decision in `docs/decisions/` and update the affected PRD before continuing. Keep stable task IDs; if a task is too large, add checkbox substeps under it and keep its parent incomplete until all are done. Changes to scope/acceptance require a clear recorded reason, not a hidden shortcut.

Spanish output is optional after P3-14. Its separate future spec should use local translation of already verified English, native-language review for meaning, and a disclosure that English verification does not itself verify the translation. No unrequested translation service or cloud audio fallback should appear in v1.
