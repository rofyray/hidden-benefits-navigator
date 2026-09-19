/**
 * The authoritative verification service behind `/api/verify`.
 *
 * It takes locally generated sentences and checklist items, rebuilds their
 * evidence from the server's own catalog, settles every deterministic claim in
 * code, and asks one bounded batch about the remainder.
 *
 * Nothing is approved by default. A dangling citation, an invented destination
 * or figure, an overstated obligation, a missing answer, a malformed response
 * or an unavailable provider all mean the whole affected card falls back to its
 * curated content. Other cards stay usable.
 */

import { CATALOG_VERSION, programById } from "@/shared/catalog";
import type { VerifyRequest, VerifyResponse } from "@/shared/contracts";
import { RULES_VERSION } from "@/shared/screening";
import { systemOne, fallbackSignalFor } from "./jev/client";
import { PINNED_JEV_MODEL, jevConfigured } from "./jev/config";
import { validateEvaluationResponse, type Answer } from "./jev/validate";
import {
  boundVerificationState,
  checkDraftItem,
  strongerThanSourceQuestionId,
  unsupportedQuestionId,
  verificationQuestions,
  VERIFICATION_POLICY,
  type DraftItemState,
  type VerificationReason,
  type VerificationState,
} from "./jev/verification";
import { verifyEvaluationToken } from "./token";

export type VerificationOutcome =
  | { readonly ok: false; readonly error: "reevaluate_required" | "catalog_mismatch" }
  | {
      readonly ok: true;
      readonly response: VerifyResponse;
      /** Closed code for content-free logging; never shown verbatim to a person. */
      readonly fallbackCode: string | null;
    };

type ProgramDraft = {
  readonly programId: string;
  /** Empty when the card already failed deterministically. */
  readonly items: DraftItemState[];
  readonly sentenceIds: string[];
  readonly checklistIds: string[];
  reasons: Set<VerificationReason>;
  failed: boolean;
};

function approved(draft: ProgramDraft): VerifyResponse["programs"][number] {
  return {
    programId: draft.programId as VerifyResponse["programs"][number]["programId"],
    status: "approved",
    approvedSentenceIds: draft.sentenceIds,
    approvedChecklistIds: draft.checklistIds,
    reasonCodes: [],
  };
}

function fallback(draft: ProgramDraft): VerifyResponse["programs"][number] {
  return {
    programId: draft.programId as VerifyResponse["programs"][number]["programId"],
    status: "fallback",
    approvedSentenceIds: [],
    approvedChecklistIds: [],
    reasonCodes: [...draft.reasons].slice(0, 10),
  };
}

/** A Noul at or below the policy ceiling is the only approving answer. */
function withinRisk(answer: Answer | undefined): boolean {
  if (!answer || answer.type !== "noul") return false;
  return answer.noul <= VERIFICATION_POLICY.maxUnsupportedRisk;
}

export async function runVerification(
  request: VerifyRequest,
  options: { nowSeconds: number; signal?: AbortSignal },
): Promise<VerificationOutcome> {
  if (request.catalogVersion !== CATALOG_VERSION) return { ok: false, error: "catalog_mismatch" };

  // The token binds this verification to the screening the server itself
  // computed, so a client cannot substitute its own rule results or programs.
  const token = await verifyEvaluationToken(request.evaluationToken, options.nowSeconds, {
    catalogVersion: CATALOG_VERSION,
    rulesVersion: RULES_VERSION,
    revision: request.revision,
  });

  if (!token.ok && token.reason !== "not_configured") {
    return { ok: false, error: "reevaluate_required" };
  }

  const screenedIds = token.ok ? Object.keys(token.payload.screening) : null;

  const drafts: ProgramDraft[] = [];

  for (const draft of request.drafts) {
    const entry: ProgramDraft = {
      programId: draft.programId,
      items: [],
      sentenceIds: [],
      checklistIds: [],
      reasons: new Set<VerificationReason>(),
      failed: false,
    };
    drafts.push(entry);

    const program = programById(draft.programId);
    if (!program) {
      entry.reasons.add("verify.unknown_program");
      entry.failed = true;
      continue;
    }
    if (screenedIds === null) {
      // Signing is not configured, so no screening can be re-bound. Curated
      // content still renders; nothing generated is approved.
      entry.reasons.add("verify.token_unverifiable");
      entry.failed = true;
      continue;
    }
    if (!screenedIds.includes(draft.programId)) {
      entry.reasons.add("verify.program_not_screened");
      entry.failed = true;
      continue;
    }

    const candidates = [
      ...draft.sentences.map((s) => ({ ...s, kind: "sentence" as const })),
      ...draft.checklist.map((c) => ({ ...c, kind: "checklist" as const })),
    ];
    if (candidates.length === 0) {
      entry.reasons.add("verify.no_drafts");
      entry.failed = true;
      continue;
    }

    for (const candidate of candidates) {
      const checked = checkDraftItem(program, candidate);
      for (const reason of checked.reasons) entry.reasons.add(reason);
      if (checked.state === null) {
        entry.failed = true;
        continue;
      }
      entry.items.push(checked.state);
      if (candidate.kind === "sentence") entry.sentenceIds.push(candidate.id);
      else entry.checklistIds.push(candidate.id);
    }
  }

  const pending = drafts.filter((d) => !d.failed);

  // Every remaining draft, across all six programs, fits one bounded batch.
  const state: VerificationState = boundVerificationState({
    programs: Object.fromEntries(
      pending.map((draft) => {
        const program = programById(draft.programId)!;
        return [draft.programId, { rules: program.eligibilitySummary, items: draft.items }];
      }),
    ),
  });
  const questions = verificationQuestions(state);

  let answers: Readonly<Record<string, Answer>> | null = null;
  let fallbackCode: string | null = null;

  if (pending.length === 0) {
    fallbackCode = "no_verifiable_drafts";
  } else if (!jevConfigured()) {
    fallbackCode = "not_configured";
  } else {
    try {
      const raw = await systemOne(
        state,
        questions,
        options.signal ? { signal: options.signal } : {},
      );
      const validated = validateEvaluationResponse(raw, questions);
      if (validated.ok) answers = validated.answers;
      else fallbackCode = validated.reason;
    } catch (error) {
      fallbackCode = fallbackSignalFor(error).code;
    }
  }

  for (const draft of pending) {
    if (answers === null) {
      // Timeout, outage, missing answers or malformed data: fail closed.
      draft.reasons.add("verify.verification_unavailable");
      draft.failed = true;
      continue;
    }
    for (const item of draft.items) {
      const unsupported = answers[unsupportedQuestionId(draft.programId, item.id)];
      if (!withinRisk(unsupported)) {
        draft.reasons.add("verify.unsupported_claim");
        draft.failed = true;
      }
      const strongerId = strongerThanSourceQuestionId(draft.programId, item.id);
      if (strongerId in questions && !withinRisk(answers[strongerId])) {
        draft.reasons.add("verify.overstated_requirement");
        draft.failed = true;
      }
    }
  }

  return {
    ok: true,
    fallbackCode,
    response: {
      revision: request.revision,
      engine: answers ? "jev" : "rules",
      model: answers ? PINNED_JEV_MODEL : null,
      programs: drafts.map((draft) => (draft.failed ? fallback(draft) : approved(draft))),
    },
  };
}
