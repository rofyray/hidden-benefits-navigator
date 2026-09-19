/**
 * Review state for proposed facts.
 *
 * Three rules shape this module:
 *
 * - Nothing reaches the screening service until a person has looked at it. The
 *   state carries `confirmed`, and the projection is the only way out.
 * - A person's own edit outranks the model. An extraction result never
 *   overwrites a field whose origin is `manual`, even if it arrives later, and a
 *   result computed for an older revision is dropped entirely.
 * - The narrative and the spans that produced each fact stay in memory. The
 *   projection is built field by field from the contracts, so no free text,
 *   quote or offset can travel with it.
 *
 * Every write is re-validated against the shared contracts: an edit that would
 * leave the state out of contract is refused and the previous value stands.
 */

import {
  evaluateRequestSchema,
  factsSchema,
  programExtensionsSchema,
  SCHEMA_VERSION,
  type EvaluateRequest,
  type Facts,
  type ProgramExtensions,
  type ProgramId,
} from "@/shared/contracts";
import type { ExtractionGroup } from "@/shared/extraction-schema";
import type { ExtractionRun } from "@/client/extraction/extract";
import { emptyExtensions, emptyFacts, type FactOrigin } from "@/client/extraction/validate";

/** In-memory only: where in the narrative a proposed fact came from. */
export type SourceSpan = { start: number; end: number };

export type ReviewState = {
  /** Bumped by every meaningful change, so stale work can be recognised. */
  revision: number;
  facts: Facts;
  extensions: ProgramExtensions;
  /** Field path → how the value got there. Absent means untouched. */
  origins: Record<string, FactOrigin>;
  /** Field paths the model could not pin down; asked rather than assumed. */
  ambiguous: Record<string, true>;
  groupsAsked: ExtractionGroup[];
  /** Never projected to the network. */
  narrative: string;
  /** Never projected to the network. */
  sourceSpans: Record<string, SourceSpan>;
  confirmed: boolean;
  manualRequired: boolean;
  /** Set when an edit was refused for being outside the contract. */
  lastRejectedPath: string | null;
};

export type ReviewAction =
  | { type: "setNarrative"; text: string }
  | {
      type: "applyExtraction";
      run: ExtractionRun;
      forRevision: number;
      spans?: Record<string, SourceSpan>;
    }
  | { type: "setField"; path: string; value: unknown }
  | { type: "requireManual" }
  | { type: "confirm" }
  | { type: "reset" };

export function initialReviewState(): ReviewState {
  return {
    revision: 0,
    facts: emptyFacts(),
    extensions: emptyExtensions(),
    origins: {},
    ambiguous: {},
    groupsAsked: [],
    narrative: "",
    sourceSpans: {},
    confirmed: false,
    manualRequired: false,
    lastRejectedPath: null,
  };
}

export function getFieldValue(state: ReviewState, path: string): unknown {
  const [head, tail] = path.split(".");
  if (!head) return undefined;
  if (tail === undefined) return (state.facts as Record<string, unknown>)[head];
  const group = (state.extensions as Record<string, unknown>)[head];
  if (typeof group !== "object" || group === null) return undefined;
  return (group as Record<string, unknown>)[tail];
}

function withField(
  state: ReviewState,
  path: string,
  value: unknown,
): { facts: Facts; extensions: ProgramExtensions } | null {
  const [head, tail] = path.split(".");
  if (!head) return null;

  if (tail === undefined) {
    const candidate = { ...state.facts, [head]: value };
    const parsed = factsSchema.safeParse(candidate);
    if (!parsed.success) return null;
    return { facts: parsed.data, extensions: state.extensions };
  }

  const group = (state.extensions as Record<string, unknown>)[head];
  if (typeof group !== "object" || group === null) return null;
  const candidate = {
    ...state.extensions,
    [head]: { ...(group as Record<string, unknown>), [tail]: value },
  };
  const parsed = programExtensionsSchema.safeParse(candidate);
  if (!parsed.success) return null;
  return { facts: state.facts, extensions: parsed.data };
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "setNarrative":
      return { ...state, narrative: action.text, confirmed: false };

    case "applyExtraction": {
      // A result computed against an older revision describes facts the person
      // has since changed; it is dropped rather than merged.
      if (action.forRevision !== state.revision) return state;

      const origins = { ...state.origins };
      const ambiguous = { ...state.ambiguous };
      let facts = { ...action.run.facts };
      let extensions = structuredMerge(action.run.extensions);

      // Manual values win, whatever the model proposed.
      for (const [path, origin] of Object.entries(state.origins)) {
        if (origin !== "manual") continue;
        const kept = withFieldOn(facts, extensions, path, getFieldValue(state, path));
        if (kept) {
          facts = kept.facts;
          extensions = kept.extensions;
        }
      }

      for (const record of action.run.records) {
        if (origins[record.field] === "manual") continue;
        origins[record.field] = "extracted";
        if (record.ambiguous) ambiguous[record.field] = true;
        else delete ambiguous[record.field];
      }

      return {
        ...state,
        facts,
        extensions,
        origins,
        ambiguous,
        groupsAsked: [...action.run.groupsAsked],
        sourceSpans: { ...state.sourceSpans, ...(action.spans ?? {}) },
        manualRequired: action.run.manualRequired,
        confirmed: false,
      };
    }

    case "setField": {
      const next = withField(state, action.path, action.value);
      if (!next) return { ...state, lastRejectedPath: action.path };
      const ambiguous = { ...state.ambiguous };
      delete ambiguous[action.path];
      const sourceSpans = { ...state.sourceSpans };
      delete sourceSpans[action.path];
      return {
        ...state,
        facts: next.facts,
        extensions: next.extensions,
        origins: { ...state.origins, [action.path]: "manual" },
        ambiguous,
        sourceSpans,
        revision: state.revision + 1,
        confirmed: false,
        lastRejectedPath: null,
      };
    }

    case "requireManual":
      return { ...state, manualRequired: true, confirmed: false };

    case "confirm": {
      const origins: Record<string, FactOrigin> = {};
      for (const [path, origin] of Object.entries(state.origins)) {
        origins[path] = origin === "extracted" ? "confirmed" : origin;
      }
      return { ...state, origins, confirmed: true, lastRejectedPath: null };
    }

    case "reset":
      return initialReviewState();
  }
}

function structuredMerge(extensions: ProgramExtensions): ProgramExtensions {
  return JSON.parse(JSON.stringify(extensions)) as ProgramExtensions;
}

function withFieldOn(
  facts: Facts,
  extensions: ProgramExtensions,
  path: string,
  value: unknown,
): { facts: Facts; extensions: ProgramExtensions } | null {
  return withField(
    {
      ...initialReviewState(),
      facts,
      extensions,
    },
    path,
    value,
  );
}

/** Field paths the person has looked at, for a "still to check" list. */
export function unreviewedPaths(state: ReviewState, paths: readonly string[]): string[] {
  return paths.filter((path) => {
    const origin = state.origins[path];
    return origin === undefined || origin === "extracted";
  });
}

export type ProjectionFailure = "not_confirmed" | "invalid_facts";

export type Projection =
  { ok: true; request: EvaluateRequest } | { ok: false; failure: ProjectionFailure };

/**
 * The only path from review state to the network. It is built key by key from
 * the request contract, so the narrative, the spans and the review metadata
 * cannot be carried along even by accident, and the result is validated before
 * it leaves.
 */
export function projectEvaluateRequest(
  state: ReviewState,
  options: { catalogVersion: string; programIds: readonly ProgramId[] },
): Projection {
  if (!state.confirmed) return { ok: false, failure: "not_confirmed" };
  const candidate = {
    schemaVersion: SCHEMA_VERSION,
    revision: state.revision,
    catalogVersion: options.catalogVersion,
    facts: state.facts,
    extensions: state.extensions,
    programIds: [...options.programIds],
  };
  const parsed = evaluateRequestSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, failure: "invalid_facts" };
  return { ok: true, request: parsed.data };
}
