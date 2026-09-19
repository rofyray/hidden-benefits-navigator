# `src/client/adapters`

Browser-only adapters for experimental capabilities: `nano` (Chrome Prompt API), `speech`
(local recognition), `playback` (speech synthesis), `manual` (guided form fallback) and
`cloud` (explicit-consent text path). These are the only modules permitted to touch
experimental browser globals, and every one of them must feature-detect before use.

Populated by P1-02 (capability probe) and Phase 2. Empty at P1-01 by design.
