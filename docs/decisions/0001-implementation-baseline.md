# 0001 — Implementation baseline deviates from the PRD's Vite + Fastify split

Date: 2026-09-19
Status: accepted
Affects: P1-01 and every later task that references `server/` or the dev proxy

## Context

`02-architecture-and-contracts.md` selects React + Vite for the browser and a separate
Node/Fastify process for same-origin `/api/*` JSON routes, with a Vite dev proxy between
them. The working repository is an existing TanStack Start application: React 19 + Vite 8,
file-based routing, and server code that runs as server routes / server functions on an
edge (Cloudflare Workers) runtime. There is no long-lived Node process to host Fastify, and
the PRD's P1-01 explicitly instructs the agent to inspect the repository and preserve
existing work.

## Decision

Keep TanStack Start and map the PRD's structure onto it rather than introducing a second
runtime.

| PRD path | This repository |
|---|---|
| `src/client/**` | `src/routes/**`, `src/components/**`, `src/hooks/**` |
| `src/client/adapters/*` | `src/client/adapters/*` (unchanged) |
| `src/shared/*` | `src/shared/*` (unchanged; imported by both sides) |
| `src/server/*` (Fastify app, config, limits, logging) | `src/server/*` — server-only modules, excluded from the client bundle by the build's import protection |
| `src/server/routes/{evaluate,verify,extract,explain,health}.ts` | `src/routes/api/**` server routes, with handler logic in `src/server/*` |
| Vite dev proxy | Not needed: client and `/api/*` are already one origin in dev and in production |
| `scripts/*`, `tests/*`, `docs/*` | Unchanged |

## Consequences

- The same-origin, no-CORS, server-secrets-never-in-the-browser properties the PRD depends
  on are preserved, and are in fact enforced by the bundler rather than by convention.
- No Fastify, no `server/index.ts` process entry, and no dev proxy configuration exists.
  Tasks that name those artifacts are satisfied by the mapped equivalent above.
- Runtime constraints of the edge worker apply: no child processes, no native modules, no
  arbitrary filesystem writes. Jev calls are plain HTTPS `fetch`, which the PRD already
  prefers over an unverified SDK.
- The package manager is `bun`, not `pnpm`. The script *names* in
  `07-testing-and-release.md` are implemented verbatim; invoke them as `bun run <name>`.
