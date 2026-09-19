/**
 * Revision-safe evaluation orchestration.
 *
 * One rule decides everything in this module: only the revision a person is
 * looking at right now can produce results. Every submission is tagged with the
 * revision it was built from and a request id; an answer that arrives for an
 * older tag is dropped, and any edit or reset aborts the request in flight and
 * clears the results on screen rather than leaving a stale answer visible.
 *
 * The six programs are always screened in one request, so there is one stage
 * for the whole screening and never a per-program half-state.
 */

import type { EvaluateRequest, EvaluateResponse } from "@/shared/contracts";
import {
  postEvaluate,
  type EvaluateClientOptions,
  type EvaluateErrorCode,
  type EvaluateOutcome,
} from "./client";

export type EvaluationStage = "idle" | "submitting" | "ready" | "failed";

export type EvaluationError = {
  code: EvaluateErrorCode;
  retryable: boolean;
  serverCatalogVersion?: string;
};

export type EvaluationState = {
  stage: EvaluationStage;
  /** The revision the current stage belongs to. */
  forRevision: number | null;
  response: EvaluateResponse | null;
  error: EvaluationError | null;
  /** Id of the submission whose answer is still welcome. */
  activeRequestId: number | null;
  nextRequestId: number;
  /** Count of answers ignored for being out of date; diagnostic only. */
  staleDropped: number;
};

export type EvaluationAction =
  | { type: "submit"; revision: number }
  | { type: "resolved"; requestId: number; outcome: EvaluateOutcome }
  | { type: "invalidate" }
  | { type: "reset" };

export function initialEvaluationState(): EvaluationState {
  return {
    stage: "idle",
    forRevision: null,
    response: null,
    error: null,
    activeRequestId: null,
    nextRequestId: 1,
    staleDropped: 0,
  };
}

export function evaluationReducer(
  state: EvaluationState,
  action: EvaluationAction,
): EvaluationState {
  switch (action.type) {
    case "submit":
      return {
        ...state,
        stage: "submitting",
        forRevision: action.revision,
        response: null,
        error: null,
        activeRequestId: state.nextRequestId,
        nextRequestId: state.nextRequestId + 1,
      };

    case "resolved": {
      // Late answer from a submission that has been superseded or cancelled.
      if (action.requestId !== state.activeRequestId) {
        return { ...state, staleDropped: state.staleDropped + 1 };
      }
      if (!action.outcome.ok && action.outcome.code === "aborted") {
        return { ...state, stage: "idle", activeRequestId: null, response: null, error: null };
      }
      if (action.outcome.ok) {
        return {
          ...state,
          stage: "ready",
          response: action.outcome.response,
          error: null,
          activeRequestId: null,
        };
      }
      return {
        ...state,
        stage: "failed",
        response: null,
        error: {
          code: action.outcome.code,
          retryable: action.outcome.retryable,
          ...(action.outcome.serverCatalogVersion === undefined
            ? {}
            : { serverCatalogVersion: action.outcome.serverCatalogVersion }),
        },
        activeRequestId: null,
      };
    }

    case "invalidate":
      // An edit happened: nothing on screen describes the current answers any
      // more, and the answer in flight is no longer wanted.
      return {
        ...state,
        stage: "idle",
        forRevision: null,
        response: null,
        error: null,
        activeRequestId: null,
      };

    case "reset":
      return { ...initialEvaluationState(), nextRequestId: state.nextRequestId };
  }
}

/** True when the shown results belong to the revision being displayed. */
export function resultsAreCurrent(state: EvaluationState, revision: number): boolean {
  return state.stage === "ready" && state.forRevision === revision && state.response !== null;
}

/** The server fell back to its own rules; no on-device or provider answer. */
export function isRulesMode(state: EvaluationState): boolean {
  return state.response?.engine === "rules";
}

export type Orchestrator = {
  getState: () => EvaluationState;
  subscribe: (listener: (state: EvaluationState) => void) => () => void;
  /** Submits one batched evaluation for the request's own revision. */
  submit: (request: EvaluateRequest) => Promise<void>;
  /** Called on every edit or reset: aborts in flight and clears results. */
  invalidate: () => void;
  reset: () => void;
};

export function createEvaluationOrchestrator(
  options: {
    post?: (request: EvaluateRequest, opts: EvaluateClientOptions) => Promise<EvaluateOutcome>;
  } = {},
): Orchestrator {
  const post = options.post ?? postEvaluate;
  let state = initialEvaluationState();
  const listeners = new Set<(state: EvaluationState) => void>();
  let controller: AbortController | null = null;

  const apply = (action: EvaluationAction) => {
    state = evaluationReducer(state, action);
    for (const listener of listeners) listener(state);
  };

  const abortInFlight = () => {
    controller?.abort();
    controller = null;
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    submit: async (request) => {
      abortInFlight();
      apply({ type: "submit", revision: request.revision });
      const requestId = state.activeRequestId;
      const own = new AbortController();
      controller = own;
      const outcome = await post(request, { signal: own.signal });
      if (controller === own) controller = null;
      apply({ type: "resolved", requestId: requestId ?? -1, outcome });
    },
    invalidate: () => {
      abortInFlight();
      apply({ type: "invalidate" });
    },
    reset: () => {
      abortInFlight();
      apply({ type: "reset" });
    },
  };
}
