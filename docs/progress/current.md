# Progress

Last completed: **P2-06 — Compose grounded explanations and checklist drafts** (2026-09-19)
Current task: **P2-07** — not started


## Completed

| Task | Evidence |
| --- | --- |
| P1-01 Repository baseline | docs/evidence/P1-01.md |
| P1-02 Device and provider preflight | docs/evidence/P1-02.md |
| P1-03 Shared contracts and catalog schema | docs/evidence/P1-03.md |
| P1-04 Curate and encode SNAP | docs/evidence/P1-04.md |
| P1-05 Curate and encode EITC | docs/evidence/P1-05.md |
| P1-06 Curate and encode CEAP/LIHEAP | docs/evidence/P1-06.md |
| P1-07 Curate Medicare cost-help pathways | docs/evidence/P1-07.md |
| P1-08 Curate and encode WIC | docs/evidence/P1-08.md |
| P1-09 Curate and encode Lifeline | docs/evidence/P1-09.md |
| P1-10 Deterministic screening and normalization | docs/evidence/P1-10.md |
| P1-11 Server Jev transport | docs/evidence/P1-11.md |
| P1-12 Evaluation questions and response validation | docs/evidence/P1-12.md |
| P1-13 Labels, ranking and clarification selection | docs/evidence/P1-13.md |
| P1-14 Thin evaluation route | docs/evidence/P1-14.md |
| P1-15 Explanation and checklist verification | docs/evidence/P1-15.md |
| P1-16 Labeled policy evaluation | docs/evidence/P1-16.md |
| P1-17 Data and backend phase gate | docs/evidence/P1-17.md |
| P2-01 Local model adapter | docs/evidence/P2-01.md |
| P2-02 Structured extraction | docs/evidence/P2-02.md |
| P2-03 Fact review and manual entry | docs/evidence/P2-03.md |
| P2-04 One-question clarification | docs/evidence/P2-04.md |
| P2-05 Evaluation orchestration | docs/evidence/P2-05.md |
| P2-06 Grounded draft composition | docs/evidence/P2-06.md |

## Open blockers

- **Live synthetic evaluation has not been run** (`bun run test:eval --live`): it
  needs the configured provider and the hosted `EVALUATION_TOKEN_SECRET`. Recorded
  release blocker per the release plan.
- **The on-device model has not been exercised on a real device.** The sandbox
  browser has no Prompt API, so the downloadable/downloading/available paths are
  covered only by unit tests. Repeat the setup check on the demo device and final
  origin.
- **The "Likely" label is untested on positive cases.** Five of six programs are
  capped at "Possibly" by unverified source effective dates, so the labeled
  evaluation could not exercise the strong-match path. Re-run once the 403-blocked
  sources below are verified.

- Texas Lifeline state site (texaslifeline.org) and the Texas PUC low-income assistance page return HTTP 403; the destination is verified via USAC, but its present-day steps are not described.

- SNAP overview page (hhs.texas.gov/services/food/snap-food-benefits) returns HTTP 403 to automated retrieval; no required-document list is claimed for SNAP.
- CEAP income guidelines page returned HTTP 403 during earlier research; to be re-attempted at its task.
- WIC income table effective period could NOT be verified: the federal WIC income eligibility guidelines page returns HTTP 403 and the state page publishes the table undated. Figures are used with the caveat recorded on the rule; review due 2026-12-19.
- The Jev API key was shared in chat and must be rotated before public deployment.

