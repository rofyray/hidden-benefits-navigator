/**
 * On-device language model adapter (Chrome Prompt API).
 *
 * This is the only module that talks to the `LanguageModel` global besides the
 * capability probe. Everything about the model is expressed through the typed
 * interfaces below, so the rest of the app never touches an experimental global
 * and never assumes support from a user-agent string.
 *
 * Guarantees this module owns:
 *
 * - Availability is probed, never assumed; `unsupported`, `unavailable`,
 *   `downloadable`, `downloading`, `available` and failures are distinct states,
 *   and none of them depend on speech support.
 * - A session is created only through an intentional setup action. A caller that
 *   does not pass `requestedByUser: true` gets `local_setup_not_requested`, so no
 *   render path can start a multi-gigabyte download on its own.
 * - Extraction and explanation use separate sessions, so a personal narrative
 *   never reaches an explanation context.
 * - Every session can be cancelled and destroyed, and `destroyAll()` releases all
 *   of them (reset, navigation, unmount). Prompts accept an `AbortSignal`.
 * - Nothing here reads, stores or logs personal data; prompt text is passed
 *   straight through to the device model and never retained.
 */

export type LocalModelState =
  "unsupported" | "unavailable" | "downloadable" | "downloading" | "available" | "unknown";

export type LocalModelErrorCode =
  | "local_unsupported"
  | "local_unavailable"
  | "local_setup_not_requested"
  | "local_session_failed"
  | "local_session_destroyed"
  | "local_prompt_failed"
  | "local_cancelled";

/** A failure a caller can branch on without parsing a message string. */
export class LocalModelError extends Error {
  readonly code: LocalModelErrorCode;
  constructor(code: LocalModelErrorCode, message?: string) {
    super(message ?? code);
    this.name = "LocalModelError";
    this.code = code;
  }
}

export type SessionPurpose = "extraction" | "explanation";

export type LocalModelEvent =
  | { type: "state"; state: LocalModelState }
  | { type: "progress"; loaded: number }
  | { type: "session"; purpose: SessionPurpose; open: number }
  | { type: "error"; code: LocalModelErrorCode };

export type PromptOptions = {
  /** JSON schema passed to the browser as `responseConstraint`. */
  schema?: unknown;
  signal?: AbortSignal;
};

export type LocalModelSession = {
  readonly purpose: SessionPurpose;
  readonly destroyed: boolean;
  prompt(text: string, options?: PromptOptions): Promise<string>;
  destroy(): void;
};

export type CreateSessionOptions = {
  purpose: SessionPurpose;
  /** Must be true: sessions come from an explicit setup action, never a render. */
  requestedByUser: boolean;
  signal?: AbortSignal;
  onProgress?: (loaded: number) => void;
};

/**
 * The same options are used for the availability check and for session creation,
 * as the Prompt API documentation requires: a check made with different options
 * does not describe the session that will actually be created.
 */
export const LOCAL_MODEL_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
} as const;

type MonitorLike = { addEventListener: (event: string, listener: (e: unknown) => void) => void };

type RawSession = {
  prompt: (
    text: string,
    options?: { responseConstraint?: unknown; signal?: AbortSignal },
  ) => unknown;
  destroy?: () => void;
};

export type LanguageModelLike = {
  availability?: (options?: unknown) => unknown;
  create?: (options?: unknown) => unknown;
};

export function getLanguageModelGlobal(): LanguageModelLike | null {
  const candidate = (globalThis as Record<string, unknown>)["LanguageModel"];
  if (!candidate) return null;
  if (typeof candidate === "object" || typeof candidate === "function") {
    return candidate as LanguageModelLike;
  }
  return null;
}

export function localModelStateFrom(value: unknown): LocalModelState {
  switch (value) {
    case "available":
      return "available";
    case "downloadable":
      return "downloadable";
    case "downloading":
      return "downloading";
    case "unavailable":
      return "unavailable";
    default:
      return "unknown";
  }
}

/** True when the state means a session attempt can reasonably be made. */
export function canCreateSession(state: LocalModelState): boolean {
  return state === "available" || state === "downloadable" || state === "downloading";
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof LocalModelError === false &&
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "AbortError"
  );
}

export type LocalModelAdapter = {
  /** Last state observed, without probing again. `unknown` before the first probe. */
  readonly state: LocalModelState;
  readonly openSessionCount: number;
  probe(): Promise<LocalModelState>;
  createSession(options: CreateSessionOptions): Promise<LocalModelSession>;
  destroyAll(): void;
  subscribe(listener: (event: LocalModelEvent) => void): () => void;
};

export function createLocalModelAdapter(
  deps: { getModel?: () => LanguageModelLike | null } = {},
): LocalModelAdapter {
  const getModel = deps.getModel ?? getLanguageModelGlobal;
  const listeners = new Set<(event: LocalModelEvent) => void>();
  const open = new Set<LocalModelSession>();
  let state: LocalModelState = "unknown";

  function emit(event: LocalModelEvent): void {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // A subscriber's own failure must never take the adapter down.
      }
    }
  }

  function setState(next: LocalModelState): LocalModelState {
    state = next;
    emit({ type: "state", state: next });
    return next;
  }

  function fail(code: LocalModelErrorCode, message?: string): LocalModelError {
    emit({ type: "error", code });
    return new LocalModelError(code, message);
  }

  async function probe(): Promise<LocalModelState> {
    const model = getModel();
    if (!model || typeof model.availability !== "function") return setState("unsupported");
    try {
      return setState(localModelStateFrom(await model.availability(LOCAL_MODEL_OPTIONS)));
    } catch {
      // A probe that throws is not evidence of absence, only of not knowing.
      return setState("unknown");
    }
  }

  function wrap(raw: RawSession, purpose: SessionPurpose): LocalModelSession {
    let destroyed = false;
    const session: LocalModelSession = {
      purpose,
      get destroyed() {
        return destroyed;
      },
      async prompt(text, options = {}) {
        if (destroyed) throw fail("local_session_destroyed");
        if (options.signal?.aborted) throw fail("local_cancelled");
        try {
          const result = await raw.prompt(text, {
            ...(options.schema === undefined ? {} : { responseConstraint: options.schema }),
            ...(options.signal ? { signal: options.signal } : {}),
          });
          if (typeof result !== "string") throw new Error("non_string_result");
          return result;
        } catch (error) {
          if (isAbortError(error) || options.signal?.aborted) throw fail("local_cancelled");
          if (error instanceof LocalModelError) throw error;
          throw fail("local_prompt_failed");
        }
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        open.delete(session);
        try {
          raw.destroy?.();
        } catch {
          // Destroying twice, or after the page is going away, is not an error.
        }
        emit({ type: "session", purpose, open: open.size });
      },
    };
    open.add(session);
    emit({ type: "session", purpose, open: open.size });
    return session;
  }

  async function createSession(options: CreateSessionOptions): Promise<LocalModelSession> {
    if (!options.requestedByUser) {
      throw fail(
        "local_setup_not_requested",
        "Local model setup must come from an explicit setup action.",
      );
    }
    if (options.signal?.aborted) throw fail("local_cancelled");

    const model = getModel();
    if (!model || typeof model.create !== "function") throw fail("local_unsupported");

    const current = await probe();
    if (current === "unsupported") throw fail("local_unsupported");
    if (!canCreateSession(current)) throw fail("local_unavailable");
    if (options.signal?.aborted) throw fail("local_cancelled");

    try {
      const raw = (await model.create({
        ...LOCAL_MODEL_OPTIONS,
        ...(options.signal ? { signal: options.signal } : {}),
        monitor(monitor: MonitorLike) {
          monitor.addEventListener("downloadprogress", (event: unknown) => {
            const loaded = Number((event as { loaded?: unknown }).loaded);
            if (!Number.isFinite(loaded)) return;
            options.onProgress?.(loaded);
            emit({ type: "progress", loaded });
          });
        },
      })) as RawSession | null;

      if (!raw || typeof raw.prompt !== "function") throw new Error("bad_session");
      if (options.signal?.aborted) {
        try {
          raw.destroy?.();
        } catch {
          // Nothing to do: the caller already cancelled.
        }
        throw fail("local_cancelled");
      }
      setState("available");
      return wrap(raw, options.purpose);
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) throw fail("local_cancelled");
      if (error instanceof LocalModelError) throw error;
      throw fail("local_session_failed");
    }
  }

  function destroyAll(): void {
    for (const session of [...open]) session.destroy();
  }

  return {
    get state() {
      return state;
    },
    get openSessionCount() {
      return open.size;
    },
    probe,
    createSession,
    destroyAll,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
