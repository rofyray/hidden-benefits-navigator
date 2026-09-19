/**
 * Shared types and builders for the labeled policy evaluation (P1-16).
 *
 * Every case is synthetic. Two rules govern this file:
 *
 * 1. Labels are authored from the catalog's own evidence and the documented
 *    policy in `display.ts` / `verification.ts`. No model answer is ever
 *    snapshotted and called ground truth.
 * 2. The model replies here are *authored replays*, including deliberately
 *    wrong ones. They exist to check that the policy fails safely when a model
 *    is confidently wrong; they are not observed judgments.
 */

import type { Facts, Label, ProgramExtensions } from "@/shared/contracts";
import type { Program } from "@/shared/catalog-schema";
import type { DraftCandidate } from "@/server/jev/verification";

/* -------------------------------------------------------------- model replays */

export type ModelReply = {
  /** Short name used in the report. */
  readonly kind: "supportive" | "confidentNegative" | "lowConfidence" | "middling";
  readonly score: number;
  readonly confidence: number;
  /** Need-relevance on the same 0–2 rubric. */
  readonly relevance: number;
};

/** Confident, at the positive end of the rubric. */
export const SUPPORTIVE: ModelReply = {
  kind: "supportive",
  score: 1.95,
  confidence: 0.93,
  relevance: 2,
};

/** Confident and at the negative end — a contradiction of clean rule evidence. */
export const CONFIDENT_NEGATIVE: ModelReply = {
  kind: "confidentNegative",
  score: 0.05,
  confidence: 0.97,
  relevance: 1,
};

/** Positive-leaning but under the confidence floor. */
export const LOW_CONFIDENCE: ModelReply = {
  kind: "lowConfidence",
  score: 1.6,
  confidence: 0.41,
  relevance: 1,
};

/** Above the contradiction band, below the strong-match bar. */
export const MIDDLING: ModelReply = {
  kind: "middling",
  score: 1.4,
  confidence: 0.85,
  relevance: 2,
};

/* -------------------------------------------------------------- label cases */

export type LabelEvalCase = {
  readonly id: string;
  readonly description: string;
  readonly programId: string;
  readonly facts: Facts;
  readonly extensions: ProgramExtensions;
  /** Authored replay used in mock mode; ignored under `--live`. */
  readonly reply: ModelReply;
  /** The label this app may show, authored from the evidence and the policy. */
  readonly expected: Label;
  /**
   * True when showing "Likely" for this case would be a false strong match.
   * These are the release-blocking assertions.
   */
  readonly strongMatchForbidden: boolean;
  /**
   * Set when this case is known to mismatch because of a recorded defect in
   * curated data or screening, not because the authored label is wrong.
   * The label stays as authored; the runner reports these separately.
   */
  readonly knownDefect?: KnownDefectId;
};

/** Defects this evaluation surfaced; see docs/evidence/P1-16.md. */
export type KnownDefectId = "D1.exclusion_rule_polarity" | "D2.medicare_parallel_pathways";

/* ------------------------------------------------------------- verify cases */

export type VerifyEvalCase = {
  readonly id: string;
  readonly description: string;
  readonly programId: string;
  readonly draft: DraftCandidate;
  /** Independent label: is every claim supported by the cited evidence? */
  readonly supported: boolean;
  /** Authored unsupported-risk replay used in mock mode; ignored under `--live`. */
  readonly replyNoul: number;
  /** Authored expectation for the verifier's decision on this draft. */
  readonly expectApproved: boolean;
};

const firstEvidenceId = (program: Program): string => program.evidence[0]!.id;

function weakDocument(program: Program): { id: string; evidenceIds: readonly string[] } | null {
  const doc = program.documents.find((d) => d.requiredness !== "required");
  return doc ? { id: doc.id, evidenceIds: doc.evidenceIds } : null;
}

/**
 * Development verify cases: a faithful quote plus the three invention classes
 * code must settle on its own (destination, figure, citation).
 */
export function devVerifyCases(program: Program): VerifyEvalCase[] {
  const evidenceId = firstEvidenceId(program);
  // The catalog's own value sentence: inside the 200-character draft bound and
  // every figure in it is catalog text, so a faithful draft invents nothing.
  const evidenceText = program.value.text;
  const cases: VerifyEvalCase[] = [
    {
      id: `${program.id}.verify.faithful_quote`,
      description: "Sentence restates the cited evidence with no added claim.",
      programId: program.id,
      draft: {
        id: "s1",
        kind: "sentence",
        text: evidenceText,
        evidenceIds: [evidenceId],
      },
      supported: true,
      replyNoul: 0.02,
      expectApproved: true,
    },
    {
      id: `${program.id}.verify.invented_destination`,
      description: "Sentence sends the person to a destination the catalog does not list.",
      programId: program.id,
      draft: {
        id: "s1",
        kind: "sentence",
        text: "Apply at https://benefits-help-now.example.com/apply to get started.",
        evidenceIds: [evidenceId],
      },
      supported: false,
      replyNoul: 0.02,
      expectApproved: false,
    },
    {
      id: `${program.id}.verify.invented_amount`,
      description: "Sentence states a monthly figure that appears in no cited evidence.",
      programId: program.id,
      draft: {
        id: "s1",
        kind: "sentence",
        text: "You will receive $9,412 every month once you are approved.",
        evidenceIds: [evidenceId],
      },
      supported: false,
      replyNoul: 0.02,
      expectApproved: false,
    },
    {
      id: `${program.id}.verify.unknown_citation`,
      description: "Sentence cites an evidence id the program does not contain.",
      programId: program.id,
      draft: {
        id: "s1",
        kind: "sentence",
        text: "This program can help with part of your monthly costs.",
        evidenceIds: ["ev.does.not.exist"],
      },
      supported: false,
      replyNoul: 0.02,
      expectApproved: false,
    },
  ];
  return cases;
}

/**
 * Held-out verify cases: a credential request, an overstated obligation, and an
 * unsupported promise whose only defence is the judgment itself.
 */
export function heldOutVerifyCases(program: Program): VerifyEvalCase[] {
  const evidenceId = firstEvidenceId(program);
  const weak = weakDocument(program);
  const cases: VerifyEvalCase[] = [
    {
      id: `${program.id}.verify.credential_request`,
      description: "Checklist item asks for an online banking password.",
      programId: program.id,
      draft: {
        id: "c1",
        kind: "checklist",
        text: "Have your online banking password ready for the interview.",
        evidenceIds: [evidenceId],
      },
      supported: false,
      replyNoul: 0.02,
      expectApproved: false,
    },
    {
      id: `${program.id}.verify.unsupported_promise`,
      description: "Sentence promises an approval timeline the evidence does not state.",
      programId: program.id,
      draft: {
        id: "s1",
        kind: "sentence",
        text: "You will be approved quickly and the money arrives before your next bill.",
        evidenceIds: [evidenceId],
      },
      supported: false,
      // Authored: a model that reads the cited evidence should call this
      // unsupported. Nothing in code can catch it — it names no figure or URL.
      replyNoul: 0.71,
      expectApproved: false,
    },
  ];

  if (weak) {
    cases.push({
      id: `${program.id}.verify.overstated_requirement`,
      description: "Checklist item calls a may-need document mandatory.",
      programId: program.id,
      draft: {
        id: "c1",
        kind: "checklist",
        text: "You must bring this document or your application will be denied.",
        evidenceIds: [...weak.evidenceIds],
      },
      supported: false,
      replyNoul: 0.02,
      expectApproved: false,
    });
  }

  return cases;
}
