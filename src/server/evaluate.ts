/**
 * The authoritative evaluation service behind `/api/evaluate`.
 *
 * The route stays thin: it validates the request and calls `runEvaluation`.
 * Everything that decides an outcome happens here, from the server's own
 * catalog. A client sends facts only — never rule results, labels, scores,
 * thresholds, prompts, model names or endpoints — so tampered client state
 * cannot override the authoritative sources.
 */

import {
  allPrograms,
  catalogIndexOf,
  programHasStaleEvidence,
  CATALOG_VERSION,
} from "@/shared/catalog";
import type { EvaluateRequest, EvaluateResponse } from "@/shared/contracts";
import { RULES_VERSION, screenProgram, type ProgramScreening } from "@/shared/screening";
import { systemOne, fallbackSignalFor } from "./jev/client";
import { labelFor, rankResults } from "./jev/display";
import {
  evaluationQuestions,
  evaluationState,
  matchQuestionId,
  relevanceQuestionId,
  POLICY_VERSION,
  QUESTION_VERSION,
  type NeedKind,
  type ProgramState,
} from "./jev/policy";
import { validateEvaluationResponse } from "./jev/validate";
import { PINNED_JEV_MODEL, jevConfigured } from "./jev/config";
import { signEvaluationToken } from "./token";

export type EvaluationOutcome = {
  readonly response: EvaluateResponse;
  /** Closed code for content-free logging; never shown verbatim to a person. */
  readonly fallbackCode: string | null;
};

function programStateFor(
  screening: ProgramScreening,
  program: ReturnType<typeof allPrograms>[number],
  need: NeedKind,
): ProgramState {
  const evidenceText = new Map(program.evidence.map((e) => [e.id, e.text] as const));
  const ruleText = new Map(
    program.rules.map((r) => [r.id, evidenceText.get(r.evidenceIds[0] ?? "") ?? r.id] as const),
  );
  return {
    rules: program.eligibilitySummary,
    checks: screening.criteria.map((criterion) => ({
      id: criterion.id,
      status: criterion.status,
      rule: ruleText.get(criterion.id) ?? criterion.id,
    })),
    helpDescription: program.coverage,
    need,
  };
}

export async function runEvaluation(
  request: EvaluateRequest,
  options: { evaluationDate: string; nowSeconds: number; signal?: AbortSignal } = {
    evaluationDate: new Date().toISOString().slice(0, 10),
    nowSeconds: Math.floor(Date.now() / 1000),
  },
): Promise<EvaluationOutcome> {
  const { evaluationDate, nowSeconds } = options;
  const programs = allPrograms().filter((p) => request.programIds.includes(p.id));

  const screenings = programs.map((program) =>
    screenProgram({
      program,
      facts: request.facts,
      extensions: request.extensions,
      evaluationDate,
    }),
  );

  // One batch, built from server-authored questions only.
  const states: Record<string, ProgramState> = {};
  programs.forEach((program, index) => {
    states[program.id] = programStateFor(
      screenings[index]!,
      program,
      (request.facts.need ?? "unspecified") as NeedKind,
    );
  });
  const state = evaluationState(states);
  const questions = evaluationQuestions(state);

  let signals: Record<string, { score: number; confidence: number; relevance: number }> | null =
    null;
  let fallbackCode: string | null = null;

  if (jevConfigured()) {
    try {
      const raw = await systemOne(
        state,
        questions,
        options.signal ? { signal: options.signal } : {},
      );
      const validated = validateEvaluationResponse(raw, questions);
      if (validated.ok) {
        signals = {};
        for (const program of programs) {
          const match = validated.answers[matchQuestionId(program.id)];
          const relevance = validated.answers[relevanceQuestionId(program.id)];
          if (match?.type !== "score" || relevance?.type !== "score") {
            signals = null;
            fallbackCode = "malformed_answer";
            break;
          }
          signals[program.id] = {
            score: match.score,
            confidence: match.confidence,
            relevance: relevance.score,
          };
        }
      } else {
        fallbackCode = validated.reason;
      }
    } catch (error) {
      fallbackCode = fallbackSignalFor(error).code;
    }
  } else {
    fallbackCode = "not_configured";
  }

  const labelled = programs.map((program, index) => {
    const screening = screenings[index]!;
    const signal = signals?.[program.id] ?? null;
    const outcome = labelFor({
      screening,
      covered: screening.applicable,
      staleEvidence: programHasStaleEvidence(program, evaluationDate),
      model: signal ? { score: signal.score, confidence: signal.confidence } : null,
    });
    return {
      programId: program.id,
      label: outcome.label,
      criteria: screening.criteria,
      reasonIds: [...screening.reasonIds, ...outcome.reasonIds].slice(0, 20),
      missingFieldIds: [...screening.missingFieldIds].slice(0, 40),
      matchScore: signal?.score ?? null,
      confidence: signal?.confidence ?? null,
      relevance: signal?.relevance ?? null,
      valueEvidenceId: program.value.evidenceIds[0] ?? null,
      catalogIndex: catalogIndexOf(program.id),
    };
  });

  const ranked = rankResults(labelled);

  const token = await signEvaluationToken(
    {
      revision: request.revision,
      catalogVersion: CATALOG_VERSION,
      rulesVersion: RULES_VERSION,
      screening: Object.fromEntries(
        screenings.map((s) => [s.programId, s.criteria.map((c) => `${c.id}:${c.status}`)]),
      ),
    },
    nowSeconds,
  );

  return {
    fallbackCode,
    response: {
      revision: request.revision,
      catalogVersion: CATALOG_VERSION,
      rulesVersion: RULES_VERSION,
      // An unsigned token would let /verify trust client-supplied screening.
      evaluationToken: token ?? "unsigned",
      model: signals ? PINNED_JEV_MODEL : null,
      engine: signals ? "jev" : "rules",
      questionVersion: QUESTION_VERSION,
      policyVersion: POLICY_VERSION,
      results: ranked.map((result) => ({
        programId: result.programId,
        label: result.label,
        criteria: [...result.criteria],
        reasonIds: result.reasonIds,
        missingFieldIds: result.missingFieldIds,
        matchScore: result.matchScore,
        confidence: result.confidence,
        rank: result.rank,
        valueEvidenceId: result.valueEvidenceId,
      })),
    },
  };
}
