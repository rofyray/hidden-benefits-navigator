/**
 * Development set for the labeled policy evaluation (P1-16): 24 situations,
 * four per program, each paired with an authored model replay.
 *
 * Thresholds may be tuned against this set only. The held-out set exists to
 * report what that tuning did not see.
 *
 * Each `expected` label is authored from the catalog evidence for the case plus
 * the documented order of reasoning in `display.ts` (rule exclusions, then
 * coverage/evidence/unknown blockers, then the model signal). It is not a
 * recorded model answer.
 */

import { snapCases } from "./snap-cases";
import { wicCases } from "./wic-cases";
import { eitcCases } from "./eitc-cases";
import { ceapCases } from "./ceap-cases";
import { medicareCases } from "./medicare-cases";
import { lifelineCases } from "./lifeline-cases";
import {
  CONFIDENT_NEGATIVE,
  LOW_CONFIDENCE,
  MIDDLING,
  SUPPORTIVE,
  type LabelEvalCase,
  type ModelReply,
  type KnownDefectId,
} from "./eval-cases";
import type { Facts, Label, ProgramExtensions } from "@/shared/contracts";

type SourceCase = {
  readonly id: string;
  readonly description: string;
  readonly facts: Facts;
  readonly extensions: ProgramExtensions;
};

type Row = readonly [
  index: number,
  reply: ModelReply,
  expected: Label,
  knownDefect?: KnownDefectId,
];

function build(
  programId: string,
  cases: readonly SourceCase[],
  rows: readonly Row[],
): LabelEvalCase[] {
  return rows.map(([index, reply, expected, knownDefect]) => {
    const source = cases[index]!;
    return {
      id: `${source.id}.${reply.kind}`,
      description: source.description,
      programId,
      facts: source.facts,
      extensions: source.extensions,
      reply,
      expected,
      strongMatchForbidden: expected !== "likely",
      ...(knownDefect ? { knownDefect } : {}),
    };
  });
}

/*
 * Why so many cases cap at "possibly":
 *
 * - snap, wic, ceap, medicare_help and lifeline all carry at least one source
 *   whose effective dates are unverified at the evaluation date, so the
 *   documented policy caps those cards at "possibly" no matter what the model
 *   says. No situation in this set can honestly reach "likely" until those
 *   sources are verified.
 * - Several situations leave a material fact unstated (deductions, tax year,
 *   resources), which is its own "possibly" blocker.
 *
 * Both are the policy working as documented, so the authored labels below say
 * "possibly": a stale-evidence or missing-fact blocker is resolved before the
 * model signal is read, so a low-confidence or negative model reply on one of
 * those programs still reads "possibly", never "Not a clear match". The two
 * defects recorded in P1-16 (D1 exclusion polarity, D2 Medicare parallel
 * pathways) are fixed as of P1-17, so no row carries a `knownDefect` tag.
 */
export const devLabelCases: readonly LabelEvalCase[] = [
  ...build("snap", snapCases, [
    [0, SUPPORTIVE, "possibly"],
    [1, CONFIDENT_NEGATIVE, "possibly"],
    [2, LOW_CONFIDENCE, "possibly"],
    [3, MIDDLING, "possibly"],
  ]),
  ...build("wic", wicCases, [
    [0, SUPPORTIVE, "possibly"],
    [1, CONFIDENT_NEGATIVE, "possibly"],
    [2, LOW_CONFIDENCE, "possibly"],
    [3, MIDDLING, "possibly"],
  ]),
  ...build("eitc", eitcCases, [
    [0, SUPPORTIVE, "possibly"],
    [1, CONFIDENT_NEGATIVE, "possibly"],
    [2, LOW_CONFIDENCE, "possibly"],
    [3, MIDDLING, "notAClearMatch"],
  ]),
  ...build("ceap", ceapCases, [
    [0, SUPPORTIVE, "possibly"],
    [1, CONFIDENT_NEGATIVE, "possibly"],
    [2, LOW_CONFIDENCE, "possibly"],
    [3, MIDDLING, "notAClearMatch"],
  ]),
  ...build("medicare_help", medicareCases, [
    [0, SUPPORTIVE, "possibly"],
    [1, CONFIDENT_NEGATIVE, "possibly"],
    [2, LOW_CONFIDENCE, "possibly"],
    [3, MIDDLING, "notAClearMatch"],
  ]),
  ...build("lifeline", lifelineCases, [
    [0, SUPPORTIVE, "possibly"],
    [1, CONFIDENT_NEGATIVE, "possibly"],
    [2, LOW_CONFIDENCE, "possibly"],
    [3, MIDDLING, "possibly"],
  ]),
];
