/**
 * Held-out set for the labeled policy evaluation (P1-16): 12 situations, two
 * per program, never used to choose a threshold.
 *
 * Labels are authored the same way as the development set: from the catalog
 * evidence and the documented policy order, independently of any model output.
 */

import { snapCases } from "./snap-cases";
import { wicCases } from "./wic-cases";
import { eitcCases } from "./eitc-cases";
import { ceapCases } from "./ceap-cases";
import { medicareCases } from "./medicare-cases";
import { lifelineCases } from "./lifeline-cases";
import {
  CONFIDENT_NEGATIVE,
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

export const heldOutLabelCases: readonly LabelEvalCase[] = [
  ...build("snap", snapCases, [
    [4, SUPPORTIVE, "possibly"],
    [5, CONFIDENT_NEGATIVE, "possibly"],
  ]),
  ...build("wic", wicCases, [
    [4, SUPPORTIVE, "possibly"],
    [5, CONFIDENT_NEGATIVE, "possibly"],
  ]),
  ...build("eitc", eitcCases, [
    [4, SUPPORTIVE, "possibly"],
    [5, CONFIDENT_NEGATIVE, "possibly"],
  ]),
  ...build("ceap", ceapCases, [
    [4, SUPPORTIVE, "possibly"],
    [5, CONFIDENT_NEGATIVE, "possibly"],
  ]),
  ...build("medicare_help", medicareCases, [
    [4, SUPPORTIVE, "possibly", "D2.medicare_parallel_pathways"],
    [5, CONFIDENT_NEGATIVE, "notAClearMatch"],
  ]),
  ...build("lifeline", lifelineCases, [
    [4, SUPPORTIVE, "notAClearMatch", "D1.exclusion_rule_polarity"],
    [5, CONFIDENT_NEGATIVE, "possibly"],
  ]),
];
