/**
 * Verification questions and deterministic draft checks.
 *
 * `/api/verify` receives locally generated sentences and checklist items. This
 * module decides what may be asked about them and what code decides on its own.
 *
 * Two rules matter most. Code, not a model, owns URLs, numbers, dates and
 * requiredness: a draft that names a destination or an amount the catalog does
 * not contain fails before any batch is sent. And nothing is approved by
 * default — a missing or malformed judgment fails the draft closed.
 */

import type { Program } from "@/shared/catalog-schema";
import type { Question } from "./client";

/** Bumped whenever a verification instruction's wording changes. */
export const VERIFICATION_QUESTION_VERSION = "1.0.0";

/** Bumped whenever a verification threshold changes. */
export const VERIFICATION_POLICY_VERSION = "1.0.0";

export const VERIFICATION_POLICY = {
  /**
   * A draft is approved only when its unsupported-risk Noul is at or below this
   * value. Conservative engineering starting point, not a calibrated rate.
   */
  maxUnsupportedRisk: 0.1,
  /** Hard bounds so one batch cannot grow without limit. */
  maxItemsPerProgram: 9,
  maxProgramsPerBatch: 6,
} as const;

export type DraftKind = "sentence" | "checklist";

export type DraftItemState = {
  readonly id: string;
  readonly kind: DraftKind;
  /** The locally generated wording, already length- and schema-bounded. */
  readonly text: string;
  /** Evidence sentences rebuilt from the server catalog, never client text. */
  readonly evidence: readonly string[];
  /**
   * The catalog's own strength for a cited document: `null` when the item cites
   * no document. A draft may never be stronger than this.
   */
  readonly requiredness: "required" | "mayNeed" | "askAgency" | null;
};

export type DraftProgramState = {
  /** One sentence per screening condition, from the catalog. */
  readonly rules: readonly string[];
  readonly items: readonly DraftItemState[];
};

export type VerificationState = {
  readonly programs: Record<string, DraftProgramState>;
};

export function unsupportedQuestionId(programId: string, itemId: string): string {
  return `${programId}_${itemId}_unsupported`;
}

export function strongerThanSourceQuestionId(programId: string, itemId: string): string {
  return `${programId}_${itemId}_stronger`;
}

export function boundVerificationState(state: VerificationState): VerificationState {
  const programs: Record<string, DraftProgramState> = {};
  for (const id of Object.keys(state.programs).slice(0, VERIFICATION_POLICY.maxProgramsPerBatch)) {
    const program = state.programs[id]!;
    programs[id] = {
      ...program,
      items: program.items.slice(0, VERIFICATION_POLICY.maxItemsPerProgram),
    };
  }
  return { programs };
}

/**
 * Builds the single verification batch: one unsupported-claim Noul per draft,
 * plus a stronger-than-source Noul for any checklist item whose cited document
 * the catalog does not call required. Interpolated values are server-assigned
 * paths and IDs only.
 */
export function verificationQuestions(state: VerificationState): Record<string, Question> {
  const questions: Record<string, Question> = {};

  for (const programId of Object.keys(state.programs)) {
    const program = state.programs[programId]!;
    const path = `programs.${programId}`;

    for (const item of program.items) {
      questions[unsupportedQuestionId(programId, item.id)] = {
        type: "noul",
        instructions:
          `Does the text of the item with ID ${item.id} in ${path}.items make any ` +
          `claim that its own cited evidence in that item does not support — an ` +
          `amount, a date, a destination, an obligation or an eligibility promise? ` +
          `Judge only against that item's cited evidence; treat missing evidence ` +
          `as unsupported and do not infer it.`,
        criteria: {
          true: "Contains a claim the cited evidence does not support",
          false: "Every claim is supported by the cited evidence",
        },
      };

      if (item.kind === "checklist" && item.requiredness !== "required") {
        questions[strongerThanSourceQuestionId(programId, item.id)] = {
          type: "noul",
          instructions:
            `Does the text of the item with ID ${item.id} in ${path}.items state ` +
            `that a document, action or obligation is required, when that item's ` +
            `cited evidence says only that it may be needed or that the agency ` +
            `decides? Judge only against that item's cited evidence.`,
          criteria: {
            true: "States a requirement the cited evidence does not state",
            false: "Keeps the strength the cited evidence uses",
          },
        };
      }
    }
  }

  return questions;
}

/* -------------------------------------------------- deterministic draft checks */

/** Closed reason codes. They name a condition, never draft or request content. */
export type VerificationReason =
  | "verify.unknown_program"
  | "verify.program_not_screened"
  | "verify.unknown_evidence"
  | "verify.invented_url"
  | "verify.invented_amount"
  | "verify.overstated_requirement"
  | "verify.credential_request"
  | "verify.unsupported_claim"
  | "verify.verification_unavailable"
  | "verify.token_unverifiable"
  | "verify.no_drafts";

const STRONG_WORDING = /\b(required|require|requires|must|mandatory|have to|need to bring)\b/i;

const CREDENTIAL_WORDING =
  /\b(password|passcode|pin\b|login|log in|online banking|bank account number|routing number|card number)\b/i;

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s)<>"']+/gi;

/** Money, percentages, dates and bare figures all reduce to number tokens. */
const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

function numberTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const normalized = match[0].replace(/,/g, "").replace(/\.0+$/, "");
    tokens.push(normalized);
  }
  return tokens;
}

function urlTokens(text: string): string[] {
  return [...text.matchAll(URL_PATTERN)].map((m) =>
    m[0]
      .replace(/^https?:\/\//i, "")
      .replace(/[.,;:)]+$/, "")
      .toLowerCase(),
  );
}

export type DraftCandidate = {
  readonly id: string;
  readonly kind: DraftKind;
  readonly text: string;
  readonly evidenceIds: readonly string[];
};

export type DeterministicResult = {
  readonly reasons: readonly VerificationReason[];
  /** The item state to send for judgment, absent when the draft already failed. */
  readonly state: DraftItemState | null;
};

/**
 * Checks one draft against the server's own catalog. Every claim a model could
 * only guess at — evidence identity, destinations, figures, requiredness and
 * credential requests — is settled here, before anything is sent anywhere.
 */
export function checkDraftItem(program: Program, candidate: DraftCandidate): DeterministicResult {
  const reasons = new Set<VerificationReason>();

  const evidenceById = new Map(program.evidence.map((e) => [e.id, e] as const));
  const cited = candidate.evidenceIds.map((id) => evidenceById.get(id) ?? null);
  if (cited.some((e) => e === null)) {
    // A dangling citation cannot be reconstructed, so nothing else is decidable.
    return { reasons: ["verify.unknown_evidence"], state: null };
  }

  const evidenceTexts = cited.map((e) => e!.text);
  const allowedText = [...evidenceTexts, program.value.text].join(" ");

  // Destinations come from the catalog's application list, never from a draft.
  const allowedUrls = program.application.map((a) =>
    a.url.replace(/^https?:\/\//i, "").toLowerCase(),
  );
  for (const token of urlTokens(candidate.text)) {
    const allowed = allowedUrls.some((url) => token === url || token === `${url}/`);
    if (!allowed) reasons.add("verify.invented_url");
  }

  const allowedNumbers = new Set(numberTokens(allowedText));
  for (const token of numberTokens(candidate.text)) {
    if (!allowedNumbers.has(token)) reasons.add("verify.invented_amount");
  }

  if (CREDENTIAL_WORDING.test(candidate.text)) reasons.add("verify.credential_request");

  // Requiredness is catalog-authored. "You must bring" is only allowed when the
  // cited document is required and the evidence itself uses that strength.
  const citedDocuments = program.documents.filter((doc) =>
    doc.evidenceIds.some((id) => candidate.evidenceIds.includes(id)),
  );
  const weakest = citedDocuments.some((d) => d.requiredness !== "required")
    ? (citedDocuments.find((d) => d.requiredness !== "required")!.requiredness as
        "mayNeed" | "askAgency")
    : citedDocuments.length > 0
      ? ("required" as const)
      : null;

  if (STRONG_WORDING.test(candidate.text)) {
    // A weaker cited document can never be restated as an obligation, and any
    // obligation must appear in the cited evidence itself.
    const sourceIsStrong = weakest !== "mayNeed" && weakest !== "askAgency";
    if (!sourceIsStrong || !STRONG_WORDING.test(allowedText)) {
      reasons.add("verify.overstated_requirement");
    }
  }

  if (reasons.size > 0) return { reasons: [...reasons], state: null };

  return {
    reasons: [],
    state: {
      id: candidate.id,
      kind: candidate.kind,
      text: candidate.text,
      evidence: evidenceTexts,
      requiredness: weakest,
    },
  };
}
