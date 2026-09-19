# Jev integration through the thin server

## Contract and purpose

Use Jev for typed semantic judgments, relevance ranking, and checking locally generated explanations/checklists against approved evidence. It does not generate prose. All six programs share one evaluation batch; all displayed drafts share one verification batch. Arithmetic, dates, known exclusions, permissions, URL selection and final display policy stay in code.

The supplied Jev reference is the primary implementation reference. Its HTTP shapes were cross-checked against the [official API](https://docs.typesafe.ai/api), and pinning against [Models](https://docs.typesafe.ai/models), on September 19, 2026. Use `jev-1.13.0`; inspect the returned model and treat a mismatch as an unevaluated configuration change. Do not quote historical latency, price or rate limits as current product guarantees.

## Server-only environment

```dotenv
TYPESAFE_API_KEY=
JEV_MODEL=jev-1.13.0
EVALUATION_SIGNING_SECRET=
CLOUD_TEXT_ENABLED=false
ANTHROPIC_API_KEY=
CLOUD_MODEL=
```

The pasted key is not reproduced here or placed in `.env.example`. Provision secrets through local environment or deployment secret storage. A missing Jev secret yields rules mode and an operator-visible configuration failure, not a client-side prompt to enter the key.

## Minimal HTTP adapter with bounded retries

This is project-authored starter code based on the supplied HTTP reference, not an official SDK wrapper. Put it only in `src/server/jev/client.ts`. It is intentionally transport-only: runtime answer validation and display policy follow below. The PRD snippets have not been executed against a live key.

```ts
export type Question =
  | { type: 'noul'; instructions: string;
      criteria?: { true: string; false: string } }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'choice'; instructions: string;
      criteria: Record<string, string | null> };

export class JevError extends Error {
  code: string;
  status?: number;
  constructor(code: string, status?: number) {
    super(code); this.code = code; this.status = status;
  }
}
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const retryable = (s: number) => s === 408 || s === 429 || s >= 500;
function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

export async function systemOne(
  state: unknown, questions: Record<string, Question>,
  options: { signal?: AbortSignal; budgetMs?: number } = {},
): Promise<unknown> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new JevError('not_configured');
  const model = process.env.JEV_MODEL ?? 'jev-1.13.0';
  if (model !== 'jev-1.13.0') throw new JevError('unevaluated_model');
  const deadline = Date.now() + (options.budgetMs ?? 8000);
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (options.signal?.aborted) throw new JevError('aborted');
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new JevError('timed_out');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, remaining);
    let delay = Math.min(2000, 250 * 2 ** attempt + Math.random() * 150);
    try {
      const res = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, model, questions }),
      });
      if (res.ok) {
        try { return await res.json(); }
        catch { throw new JevError('invalid_response'); }
      }
      // Do not log or forward upstream bodies: they may echo submitted content.
      if (!retryable(res.status)) throw new JevError('upstream_rejected', res.status);
      const retryMsHeader = res.headers.get('retry-after-ms');
      const retryMs = retryMsHeader === null ? null : Number(retryMsHeader);
      const serverDelay = retryMs !== null && Number.isFinite(retryMs)
        ? Math.max(0, retryMs) : retryAfterMs(res.headers.get('retry-after'));
      if (serverDelay !== null) delay = serverDelay;
      last = new JevError('temporarily_unavailable', res.status);
      await res.body?.cancel();
    } catch (error) {
      if (options.signal?.aborted) throw new JevError('aborted');
      if (error instanceof JevError) throw error;
      last = new JevError(controller.signal.aborted ? 'timed_out' : 'connection_error');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
    if (attempt === 2) break;
    if (delay >= deadline - Date.now()) throw new JevError('timed_out');
    // At most a bounded delay; cancellation is checked before the next request.
    await wait(delay);
  }
  throw last ?? new JevError('temporarily_unavailable');
}
```

Retries cover 408, 429 and 5xx (including 529). Never retry bad requests/authentication errors as if they were temporary. Add request cancellation tests, a response-size cap at the HTTP boundary, and route-level timeouts. An aborted browser request must not cause later UI changes. A provider limit longer than the remaining budget causes graceful fallback; do not retry early in violation of `Retry-After`.

## Question construction

Keep all questions and policy thresholds in `src/server/jev/policy.ts`, with `questionVersion` and `policyVersion`. Every instruction is complete; IDs are application keys, not context for the model. Use authored IDs only when interpolating paths. Separate questions do not see one another's answers.

```ts
import type { Question } from './client';
type ProgramState = {
  rules: string[];
  checks: { id: string; status: string; explanation: string }[];
  helpDescription: string;
  need: 'food' | 'tax' | 'utilities' | 'medicare' | 'phone' | 'unspecified';
};
export function evaluationQuestions(programs: Record<string, ProgramState>) {
  const q: Record<string, Question> = {};
  for (const id of Object.keys(programs)) {
    // id comes from the server's fixed program-ID enum, never user text.
    const p = `programs.${id}`;
    q[`${id}_match`] = {
      type: 'score',
      instructions: `How strongly do the supplied screening checks in ${p}.checks ` +
        `support a preliminary match to ${p}.rules? Use the supplied statuses; ` +
        `do not calculate numbers or infer missing facts.`,
      criteria: [
        'The provided checks indicate a relevant unmet requirement.',
        'The checks leave a material uncertainty or incomplete pathway.',
        'The provided screening checks support a preliminary match.',
      ],
    };
    q[`${id}_relevance`] = {
      type: 'score',
      instructions: `How directly does ${p}.helpDescription address ${p}.need?`,
      criteria: ['No stated connection', 'Potentially useful', 'Directly addresses the stated need'],
    };
    for (const check of programs[id].checks) {
      q[`${id}_${check.id}_supported`] = {
        type: 'noul',
        instructions: `Does the check with ID ${check.id} in ${p}.checks explicitly ` +
          `support its corresponding screening condition in ${p}.rules? ` +
          `Treat missing evidence as uncertain; do not invent it.`,
        criteria: { true: 'Explicit support', false: 'Explicit contradiction' },
      };
    }
  }
  return q;
}
```

This is a construction pattern; production state uses criterion evidence IDs and one localized rule sentence per check. No whole handbook in state. `need` is a confirmed bounded enum extracted locally; it does not permit forwarding a free-text need narrative. Relevance is not an estimated dollar benefit.

## Response validator

Treat the `unknown` result as untrusted. Implement a strict envelope and an answer validator derived from the actual question map. Require the pinned model and all requested answer IDs. Reject unexpected IDs; each Noul must be finite and in [0,1]. Choice keys must be in its authored criteria. Score must be finite and between 0 and `criteria.length - 1`; require finite confidence in [0,1], matching legend indices, probabilities in [0,1], and their sum within 0.01 of 1. Distinguish malformed transport data from a valid low-confidence answer. Missing verification output fails that draft closed; never treat missing data as zero risk.

No `confidence` field exists on Noul. Use `.noul` for yes/no evidence. Score and confidence are separate: a confident score near zero is a confident non-match, not a “Likely” result.

## Display policy and calibration

Initial policy values below are conservative engineering starting points, not calibrated eligibility probabilities. Store them centrally and validate them on the project's labeled cases before release:

| Input / condition | Outcome |
|---|---|
| Unsupported jurisdiction, expired source, unresolved required rule, missing material fact | Cannot show “Likely”; explain coverage or uncertainty |
| Definitive applicable exclusion with all exception paths resolved | “Not a clear match,” with source-backed reason and agency route |
| No rule blocker, complete positive screening evidence, match score ≥1.70 on 0–2 rubric and confidence ≥0.80 | Candidate for “Likely”; still preliminary |
| Positive/uncertain evidence without the preceding conditions | “Possibly,” with a specific fact or agency step to confirm |
| Low model confidence (<0.50) or contradictory model/rule signals | “Not a clear match”/review with factual uncertainty, never categorical denial |
| Provider unavailable | Rules mode, show explicit fallback badge; no fabricated confidence |

Handle rule uncertainty before interpreting model confidence. For rules fallback, complete positive screening predicates can produce “Likely — rule check,” unknown predicates produce “Possibly,” and complete exclusions produce “Not a clear match.” Release evaluation must test those fallback labels too. No fallback probability is presented as Jev output.

Sort labels Likely → Possibly → Other. Within a label sort confirmed need relevance descending (0–2), then match score descending, then stable catalog order. Unknown/missing scores do not become zero income or a negative judgment. Do not add monthly discounts, tax credits and uncertain assistance into a fake total savings figure.

Follow-up selection: first use code's missing/ambiguous material fields, ranked by number of program pathways they unlock, then burden, then stable order. If multiple relevant supported-check Nouls remain uncertain, closeness to 0.5 may break ties. Never ask someone to resolve a policy interpretation that only the agency can answer. Never allow a low-relevance program to trigger repeated invasive questions. Maximum three optional turns; then provide partial results and edits.

## Verification request and approval

Use a fresh evidence-only Nano session. For each sentence and checklist item, send `{id,text,evidenceIds}` to the server. Server validates the signed evaluation token, reconstructs evidence from its catalog, checks the item belongs to that program, and rejects invented IDs/URLs/amounts before Jev. Generated prose is always plain text; render without HTML injection.

One Noul per sentence and per checklist item:

```ts
const question: Question = {
  type: 'noul',
  instructions: 'Does `drafts.wic.sentences[0].text` make any factual claim ' +
    'that is not supported by `drafts.wic.sentences[0].evidence`?',
  criteria: {
    true: 'At least one unsupported factual claim, guarantee, amount or condition.',
    false: 'Every factual claim is supported; no stronger promise is added.',
  },
};
```

The builder iterates bounded drafts, with server-assigned paths. For checklist items, ask whether the suggested action/document/obligation is unsupported by the item's cited evidence. Include unsupported “required” wording as a failure when the source says only “may need.” IDs alone do not prove generated wording is safe.

Initial acceptance requires unsupported-risk Noul ≤0.10 for every sentence/item plus all deterministic checks. If any element fails or verification is unavailable/invalid, replace the whole affected card's generated prose/checklist with its reviewed fallback content. Other verified cards remain usable. Do not render or speak provisional generation during verification. Do not endlessly regenerate to obtain a low score. Record approval mode as `jev_verified` or `curated_fallback`; no claim of infallibility.

Verifier tests must include invented benefit amounts, fabricated deadlines, required bank credentials, unsupported document requirements, misleading eligibility promises, an injected URL, contradicting evidence, and legitimate paraphrases. Tune on development examples; reserve held-out fixtures. A few passing personas do not establish calibration. A model or policy update requires re-evaluation before promotion.
