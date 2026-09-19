# Device and provider preflight

Date: 2026-09-19
Status: accepted (re-run required on any target-device or provider change)

## What was probed

Each capability is probed and reported independently. They are never collapsed
into a single "supported browser" flag, and no probe starts a recording or a
transcription.

| Capability | Probe | Source |
|---|---|---|
| On-device language model (Nano) | `LanguageModel.availability()` mapped to available / downloadable / downloading / unavailable / unknown | `src/client/adapters/capabilities.ts` |
| Local speech pack | presence of `SpeechRecognition` / `webkitSpeechRecognition` | same |
| Microphone permission | `navigator.permissions.query({name:'microphone'})`, plus an explicit user-triggered `getUserMedia` request | same |
| Local playback voice | `speechSynthesis.getVoices()` filtered to `localService` | same |
| Jev provider | one tiny synthetic server-side request | `src/lib/preflight.functions.ts` → `src/server/jev/client.ts` |

## Measured environment (this run)

- Origin: `http://localhost:8080`, fresh automation profile, no extensions.
- Browser: HeadlessChrome 141.0.7390.37 on Linux x86_64 (sandbox environment).
- On-device language model: **not supported here** (`LanguageModel` is absent).
- Local speech pack: **available** (`webkitSpeechRecognition` present).
- Microphone permission: **not decided** (no grant in a fresh automation profile).
- Local playback voice: **not known** (no voices registered in this environment).
- Jev: **reachable**, returned model `jev-1.13.0`, matching the pinned model; round trip 595 ms.

## Download offer

The page offers a user-triggered download (`LanguageModel.create()` with a
`downloadprogress` monitor) only when availability is `downloadable` or
`downloading`, then re-runs the probe. It never downloads automatically and it
never blocks the flow. Where `LanguageModel` is absent the state is recorded as
a reproducible unsupported state rather than retried.

## Selected capability plan

`selectCapabilityPlan()` chooses:

- **voice** — local speech available and microphone not blocked and Nano available.
- **typed-local** — Nano available but speech or microphone unusable.
- **manual** — anything else: a plain form, with no understanding step off the device.

In the measured environment the selected plan is **manual**, and the manual plan
is runnable: it depends on no browser AI capability.

Cloud text understanding stays disabled. It is not required by the selected
plan and the release does not claim it is enabled.

## Limits carried forward

- The measured browser results describe this sandbox, not a user's Chrome
  profile with the on-device model enabled. A real-device probe on a target
  Chrome build is required before any release claim that voice or on-device
  understanding works, and it is carried to the P1-17 and P3-14 gates.
- The Jev credential currently in use was shared in chat and must be rotated
  before public deployment.
- No time is spent chasing browser flags; unsupported states select a fallback.
