# Hidden Benefits Navigator

A voice-first benefits navigator for Texas. It screens people for six support
programs and answers with honest labels — **Likely**, **Possibly**, or **Not a
clear match** — never an approval decision. The program always makes the final
decision.

## Programs screened

| Program | What it helps with |
| --- | --- |
| SNAP | Food |
| WIC | Food and nutrition (pregnancy through age 5) |
| EITC | Federal tax credit |
| CEAP | Utility bills (referral-only until Texas income rules are verifiable) |
| Medicare cost help | MSP (state) and Extra Help (federal) — kept strictly separate |
| Lifeline | Phone and internet discount |

## How it works

- **Local-first privacy.** Raw voice never leaves the browser. Only structured
  facts and sanitized draft text are sent to the server.
- **Deterministic rules.** Eligibility criteria live in a versioned JSON
  catalog (`src/shared/catalog/programs/*.json`) — one file per program, every
  threshold backed by a sourced, dated evidence record
  (`src/shared/catalog/sources/*.json`). Money is integer cents; income
  intervals are compared with exact interval arithmetic; every criterion
  resolves to pass / fail / unknown / not-applicable.
- **Bounded model use.** The server recomputes the rules itself, then asks the
  Jev screening service one bounded batch of questions (`/api/evaluate`,
  `/api/verify`). If the key is missing, the provider is down, or the answer
  is malformed, the result falls back to a clearly labelled rules-only mode —
  a bad answer is never softened into a guess.
- **Honest gaps.** Stale or unverifiable evidence demotes a program to a
  referral instead of guessing (e.g. CEAP income guidelines currently return
  403 from the state, so no income limit is encoded).

## Development

```sh
bun install
bun run dev
```

### Commands

| Command | Purpose |
| --- | --- |
| `bun run lint` | ESLint |
| `bunx tsgo --noEmit` | Typecheck |
| `bunx vitest run` | Unit + integration tests |
| `bun run data:validate` | Validate the program catalog against its schemas |
| `bun run data:manifest` | Rebuild the catalog content manifest (hashes) |
| `bun run build` | Production build |

### Environment

Copy `.env.example` and fill in values (server-side only, never committed):

- `TYPESAFE_API_KEY` — Jev screening service key
- `JEV_MODEL` — pinned model version
- `EVALUATION_TOKEN_SECRET` — signs the short-lived evaluation tokens

## Project layout

```text
src/shared/          contracts, catalog schemas + data, screening engine
src/server/          Jev transport, display policy, evaluation, tokens
src/routes/api/      same-origin API routes (evaluate, verify, health)
tests/               unit, integration, and labeled fixture cases
docs/prd/            product requirements and phase task lists
docs/evidence/       per-task verification records
docs/progress/       current build status
```

## Built with

TanStack Start · React 19 · TypeScript · Tailwind CSS v4 · Zod
