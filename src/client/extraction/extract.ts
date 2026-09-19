/**
 * Orchestration of on-device extraction.
 *
 * The shape of the run is deliberate: one small common pass, then only the
 * program groups the stated facts could plausibly need, each with its own
 * bounded schema. Every pass may fail independently; a failed pass leaves that
 * part at its explicit unknowns instead of poisoning the rest, and a run that
 * yields nothing reports `manualRequired` so the guided form takes over with
 * whatever the person already entered.
 *
 * Nothing here decides eligibility, and nothing here is confirmed: the result
 * is a proposal for the person to review.
 */

import type { LocalModelSession } from "@/client/adapters/nano";
import type { Facts, ProgramExtensions } from "@/shared/contracts";
import {
  commonFactsJsonSchema,
  groupJsonSchema,
  EXTRACTION_GROUPS,
  type ExtractionGroup,
} from "@/shared/extraction-schema";
import {
  buildCommonPrompt,
  buildGroupPrompt,
  buildRetryPrompt,
  capIntake,
  EXTRACTION_PROMPT_VERSION,
} from "./prompts";
import {
  emptyExtensions,
  emptyFacts,
  parseCommonProposal,
  parseGroupProposal,
  validateExtraction,
  type FactRecord,
  type ProposalFailure,
} from "./validate";

export type PassOutcome =
  | { pass: "common" | ExtractionGroup; status: "ok"; retried: boolean }
  | {
      pass: "common" | ExtractionGroup;
      status: "failed";
      failure: ProposalFailure;
      retried: boolean;
    }
  | { pass: "common" | ExtractionGroup; status: "cancelled" };

export type ExtractionRun = {
  facts: Facts;
  extensions: ProgramExtensions;
  /** Review metadata for the fields the model proposed; never sent anywhere. */
  records: FactRecord[];
  groupsAsked: ExtractionGroup[];
  outcomes: PassOutcome[];
  truncated: boolean;
  /** True when nothing usable came back and the guided form must take over. */
  manualRequired: boolean;
  promptVersion: string;
};

/**
 * Chooses which program groups are worth asking about. A group is included when
 * the common facts leave it open — "unknown" counts as open, because an unknown
 * pregnancy is not "not pregnant". A clear "no" is the only thing that drops a
 * group, and a dropped group keeps its explicit unknown defaults.
 */
export function selectGroups(facts: Facts): ExtractionGroup[] {
  const groups: ExtractionGroup[] = ["snap", "lifeline"];

  const wicOpen =
    facts.pregnant !== "no" ||
    facts.postpartumUnder6Months !== "no" ||
    facts.breastfeedingUnder12Months !== "no" ||
    facts.childUnder5 !== "no";
  if (wicOpen) groups.push("wic");

  const medicareOpen =
    facts.medicarePartA !== "no" || facts.ageBand === "60to64" || facts.ageBand === "65plus";
  if (medicareOpen) groups.push("medicare");

  if (facts.employment !== "unemployed" && facts.employment !== "retired") groups.push("eitc");

  if (facts.need === "utilities" || facts.need === "unspecified") groups.push("ceap");

  return EXTRACTION_GROUPS.filter((group) => groups.includes(group));
}

type PromptOnce = {
  session: LocalModelSession;
  prompt: string;
  schema: unknown;
  signal?: AbortSignal;
  intake: string;
};

/** One pass with at most one shorter retry, per the local-AI plan. */
async function promptWithRetry(
  { session, prompt, schema, signal, intake }: PromptOnce,
  parse: (raw: string) => { ok: boolean; failure?: ProposalFailure },
): Promise<{
  raw: string | null;
  failure?: ProposalFailure;
  retried: boolean;
  cancelled: boolean;
}> {
  for (const [attempt, text] of [prompt, buildRetryPrompt(prompt, intake)].entries()) {
    if (signal?.aborted) return { raw: null, retried: attempt > 0, cancelled: true };
    try {
      const raw = await session.prompt(text, { schema, ...(signal ? { signal } : {}) });
      const checked = parse(raw);
      if (checked.ok) return { raw, retried: attempt > 0, cancelled: false };
      if (attempt === 1) {
        return {
          raw: null,
          ...(checked.failure ? { failure: checked.failure } : {}),
          retried: true,
          cancelled: false,
        };
      }
    } catch (error) {
      if (signal?.aborted || (error as { code?: string }).code === "local_cancelled") {
        return { raw: null, retried: attempt > 0, cancelled: true };
      }
      if (attempt === 1) return { raw: null, failure: "empty", retried: true, cancelled: false };
    }
  }
  return { raw: null, failure: "empty", retried: true, cancelled: false };
}

export type ExtractOptions = {
  /** Facts already confirmed or typed by the person; they always win. */
  base?: { facts: Facts; extensions: ProgramExtensions };
  signal?: AbortSignal;
  groups?: ExtractionGroup[];
};

/**
 * Runs extraction over one narrative and returns a proposal.
 *
 * `base` values are the person's own; a proposal only fills fields the base
 * leaves at their explicit unknown, so a late model answer can never overwrite
 * a manual edit.
 */
export async function extractFacts(
  session: LocalModelSession,
  narrative: string,
  options: ExtractOptions = {},
): Promise<ExtractionRun> {
  const capped = capIntake(narrative);
  const baseFacts = options.base?.facts ?? emptyFacts();
  const baseExtensions = options.base?.extensions ?? emptyExtensions();
  const facts: Facts = { ...baseFacts };
  const extensions: ProgramExtensions = structuredCloneish(baseExtensions);
  const records: FactRecord[] = [];
  const outcomes: PassOutcome[] = [];

  const defaults = emptyFacts();
  const commonRun = await promptWithRetry(
    {
      session,
      prompt: buildCommonPrompt(capped.text),
      schema: commonFactsJsonSchema,
      intake: capped.text,
      ...(options.signal ? { signal: options.signal } : {}),
    },
    (raw) => parseCommonProposal(raw),
  );

  if (commonRun.cancelled) {
    outcomes.push({ pass: "common", status: "cancelled" });
  } else if (commonRun.raw === null) {
    outcomes.push({
      pass: "common",
      status: "failed",
      failure: commonRun.failure ?? "empty",
      retried: commonRun.retried,
    });
  } else {
    const parsed = parseCommonProposal(commonRun.raw);
    if (parsed.ok) {
      const applied = new Set<string>();
      for (const [key, value] of Object.entries(parsed.value)) {
        const field = key as keyof Facts;
        const isDefault = JSON.stringify(baseFacts[field]) === JSON.stringify(defaults[field]);
        if (!isDefault) continue;
        (facts as Record<string, unknown>)[field] = value;
        applied.add(key);
      }
      // Only fields this run actually set are reviewable as "extracted"; the
      // person's own values keep their origin.
      records.push(...parsed.records.filter((record) => applied.has(record.field)));
      outcomes.push({ pass: "common", status: "ok", retried: commonRun.retried });
    }
  }

  const groups = options.groups ?? selectGroups(facts);
  for (const group of groups) {
    if (options.signal?.aborted) {
      outcomes.push({ pass: group, status: "cancelled" });
      continue;
    }
    const run = await promptWithRetry(
      {
        session,
        prompt: buildGroupPrompt(group, capped.text),
        schema: groupJsonSchema(group),
        intake: capped.text,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      (raw) => parseGroupProposal(group, raw),
    );
    if (run.cancelled) {
      outcomes.push({ pass: group, status: "cancelled" });
      continue;
    }
    if (run.raw === null) {
      outcomes.push({
        pass: group,
        status: "failed",
        failure: run.failure ?? "empty",
        retried: run.retried,
      });
      continue;
    }
    const parsed = parseGroupProposal(group, run.raw);
    if (!parsed.ok) {
      outcomes.push({
        pass: group,
        status: "failed",
        failure: "schema_invalid",
        retried: run.retried,
      });
      continue;
    }
    const emptyGroup = emptyExtensions()[group] as Record<string, unknown>;
    const baseGroup = baseExtensions[group] as Record<string, unknown>;
    const target = extensions[group] as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed.value as Record<string, unknown>)) {
      if (JSON.stringify(baseGroup[key]) === JSON.stringify(emptyGroup[key])) target[key] = value;
    }
    records.push(...parsed.records);
    outcomes.push({ pass: group, status: "ok", retried: run.retried });
  }

  const anyOk = outcomes.some((outcome) => outcome.status === "ok");
  const valid = validateExtraction(facts, extensions);

  return {
    facts: valid ? facts : baseFacts,
    extensions: valid ? extensions : baseExtensions,
    records: valid ? records : [],
    groupsAsked: groups,
    outcomes,
    truncated: capped.truncated,
    manualRequired: !anyOk || !valid,
    promptVersion: EXTRACTION_PROMPT_VERSION,
  };
}

/** Structured clone without depending on a browser global being present. */
function structuredCloneish<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
