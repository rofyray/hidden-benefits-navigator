/**
 * On-device model adapter (P2-01).
 *
 * The browser global is replaced by a fake in every test: no real model is
 * downloaded and no personal text is used. The behaviours asserted here are the
 * ones an unsupported or interrupted device depends on — no crash, no stall, and
 * every session destroyable.
 */

import { describe, expect, it, vi } from "vitest";
import {
  canCreateSession,
  createLocalModelAdapter,
  localModelStateFrom,
  LocalModelError,
  type LanguageModelLike,
  type LocalModelEvent,
} from "@/client/adapters/nano";

type FakeOptions = {
  availability?: string | (() => Promise<string> | string);
  createResult?: unknown;
  createError?: unknown;
  promptResult?: unknown;
  promptError?: unknown;
  progress?: number[];
};

function fakeModel(options: FakeOptions = {}) {
  const destroyed: string[] = [];
  const prompts: { text: string; options: Record<string, unknown> | undefined }[] = [];
  const model: LanguageModelLike = {
    availability: () =>
      typeof options.availability === "function"
        ? options.availability()
        : (options.availability ?? "available"),
    create: async (created?: unknown) => {
      if (options.createError) throw options.createError;
      if ("createResult" in options) return options.createResult;
      const monitor = (created as { monitor?: (m: unknown) => void }).monitor;
      if (monitor) {
        monitor({
          addEventListener: (_event: string, listener: (e: unknown) => void) => {
            for (const loaded of options.progress ?? []) listener({ loaded });
          },
        });
      }
      return {
        prompt: async (text: string, promptOptions?: Record<string, unknown>) => {
          prompts.push({ text, options: promptOptions });
          if (options.promptError) throw options.promptError;
          return "promptResult" in options ? options.promptResult : '{"ok":true}';
        },
        destroy: () => destroyed.push("destroyed"),
      };
    },
  };
  return { model, destroyed, prompts };
}

function adapterFor(options: FakeOptions = {}) {
  const fake = fakeModel(options);
  const events: LocalModelEvent[] = [];
  const adapter = createLocalModelAdapter({ getModel: () => fake.model });
  adapter.subscribe((event) => events.push(event));
  return { adapter, events, ...fake };
}

const USER_SETUP = { purpose: "extraction", requestedByUser: true } as const;

describe("state mapping", () => {
  it("maps the documented availability values and nothing else", () => {
    expect(localModelStateFrom("available")).toBe("available");
    expect(localModelStateFrom("downloadable")).toBe("downloadable");
    expect(localModelStateFrom("downloading")).toBe("downloading");
    expect(localModelStateFrom("unavailable")).toBe("unavailable");
    expect(localModelStateFrom("after-download")).toBe("unknown");
    expect(localModelStateFrom(undefined)).toBe("unknown");
  });

  it("treats only the three usable states as worth attempting", () => {
    expect(canCreateSession("available")).toBe(true);
    expect(canCreateSession("downloadable")).toBe(true);
    expect(canCreateSession("downloading")).toBe(true);
    expect(canCreateSession("unavailable")).toBe(false);
    expect(canCreateSession("unsupported")).toBe(false);
    expect(canCreateSession("unknown")).toBe(false);
  });
});

describe("unsupported and unavailable devices", () => {
  it("reports unsupported without throwing when the global is absent", async () => {
    const adapter = createLocalModelAdapter({ getModel: () => null });
    await expect(adapter.probe()).resolves.toBe("unsupported");
    await expect(adapter.createSession(USER_SETUP)).rejects.toMatchObject({
      code: "local_unsupported",
    });
    expect(adapter.openSessionCount).toBe(0);
  });

  it("reports unknown rather than absence when the probe itself throws", async () => {
    const { adapter } = adapterFor({
      availability: () => {
        throw new Error("probe exploded");
      },
    });
    await expect(adapter.probe()).resolves.toBe("unknown");
    expect(adapter.state).toBe("unknown");
  });

  it("refuses a session when the model is unavailable on this device", async () => {
    const { adapter } = adapterFor({ availability: "unavailable" });
    await expect(adapter.createSession(USER_SETUP)).rejects.toMatchObject({
      code: "local_unavailable",
    });
  });

  it("surfaces a creation failure as a typed error, not a crash", async () => {
    const { adapter } = adapterFor({ createError: new Error("no room on device") });
    await expect(adapter.createSession(USER_SETUP)).rejects.toMatchObject({
      code: "local_session_failed",
    });
    expect(adapter.openSessionCount).toBe(0);
  });

  it("rejects a session object that does not offer prompt()", async () => {
    const { adapter } = adapterFor({ createResult: { nope: true } });
    await expect(adapter.createSession(USER_SETUP)).rejects.toBeInstanceOf(LocalModelError);
  });
});

describe("intentional setup only", () => {
  it("never downloads or creates a session without an explicit setup action", async () => {
    const { adapter, model } = adapterFor();
    const create = vi.spyOn(model, "create" as never);
    await expect(
      adapter.createSession({ purpose: "extraction", requestedByUser: false }),
    ).rejects.toMatchObject({ code: "local_setup_not_requested" });
    expect(create).not.toHaveBeenCalled();
  });

  it("reports download progress to the caller and to subscribers", async () => {
    const seen: number[] = [];
    const { adapter, events } = adapterFor({ progress: [0.25, 0.5, 1] });
    await adapter.createSession({ ...USER_SETUP, onProgress: (loaded) => seen.push(loaded) });
    expect(seen).toEqual([0.25, 0.5, 1]);
    expect(events.filter((e) => e.type === "progress")).toHaveLength(3);
  });

  it("ignores a progress event without a usable number", async () => {
    const seen: number[] = [];
    const fake = fakeModel();
    fake.model.create = async (created?: unknown) => {
      (created as { monitor: (m: unknown) => void }).monitor({
        addEventListener: (_e: string, listener: (e: unknown) => void) => listener({}),
      });
      return { prompt: async () => "{}", destroy: () => {} };
    };
    const adapter = createLocalModelAdapter({ getModel: () => fake.model });
    await adapter.createSession({ ...USER_SETUP, onProgress: (loaded) => seen.push(loaded) });
    expect(seen).toEqual([]);
  });
});

describe("prompting", () => {
  it("passes the schema as responseConstraint and returns the raw string", async () => {
    const { adapter, prompts } = adapterFor({ promptResult: '{"state":"TX"}' });
    const session = await adapter.createSession(USER_SETUP);
    const schema = { type: "object" };
    await expect(session.prompt("intake text", { schema })).resolves.toBe('{"state":"TX"}');
    expect(prompts[0]!.options?.["responseConstraint"]).toBe(schema);
  });

  it("fails closed when the model answers with a non-string", async () => {
    const { adapter } = adapterFor({ promptResult: { not: "a string" } });
    const session = await adapter.createSession(USER_SETUP);
    await expect(session.prompt("text")).rejects.toMatchObject({ code: "local_prompt_failed" });
  });

  it("reports a cancelled prompt as cancelled, never as a model failure", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    const { adapter } = adapterFor({ promptError: abort });
    const session = await adapter.createSession(USER_SETUP);
    await expect(session.prompt("text")).rejects.toMatchObject({ code: "local_cancelled" });
  });

  it("does not call the model when the signal is already aborted", async () => {
    const { adapter, prompts } = adapterFor();
    const session = await adapter.createSession(USER_SETUP);
    const controller = new AbortController();
    controller.abort();
    await expect(session.prompt("text", { signal: controller.signal })).rejects.toMatchObject({
      code: "local_cancelled",
    });
    expect(prompts).toHaveLength(0);
  });

  it("refuses to prompt a destroyed session", async () => {
    const { adapter } = adapterFor();
    const session = await adapter.createSession(USER_SETUP);
    session.destroy();
    await expect(session.prompt("text")).rejects.toMatchObject({
      code: "local_session_destroyed",
    });
  });
});

describe("cancellation and cleanup", () => {
  it("cancels setup before creating anything when the signal is already aborted", async () => {
    const { adapter, model } = adapterFor();
    const create = vi.spyOn(model, "create" as never);
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.createSession({ ...USER_SETUP, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "local_cancelled" });
    expect(create).not.toHaveBeenCalled();
  });

  it("destroys a session that finished creating after the caller cancelled", async () => {
    const fake = fakeModel();
    const controller = new AbortController();
    const destroyed: string[] = [];
    fake.model.create = async () => {
      controller.abort();
      return { prompt: async () => "{}", destroy: () => destroyed.push("destroyed") };
    };
    const adapter = createLocalModelAdapter({ getModel: () => fake.model });
    await expect(
      adapter.createSession({ ...USER_SETUP, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "local_cancelled" });
    expect(destroyed).toEqual(["destroyed"]);
    expect(adapter.openSessionCount).toBe(0);
  });

  it("keeps extraction and explanation in separate sessions and destroys both", async () => {
    const { adapter, destroyed } = adapterFor();
    const extraction = await adapter.createSession({
      purpose: "extraction",
      requestedByUser: true,
    });
    const explanation = await adapter.createSession({
      purpose: "explanation",
      requestedByUser: true,
    });
    expect(extraction).not.toBe(explanation);
    expect(adapter.openSessionCount).toBe(2);

    adapter.destroyAll();
    expect(adapter.openSessionCount).toBe(0);
    expect(extraction.destroyed).toBe(true);
    expect(explanation.destroyed).toBe(true);
    expect(destroyed).toHaveLength(2);
  });

  it("is idempotent when a session is destroyed twice", async () => {
    const { adapter, destroyed } = adapterFor();
    const session = await adapter.createSession(USER_SETUP);
    session.destroy();
    session.destroy();
    expect(destroyed).toHaveLength(1);
  });

  it("survives a destroy() that throws inside the browser session", async () => {
    const fake = fakeModel();
    fake.model.create = async () => ({
      prompt: async () => "{}",
      destroy: () => {
        throw new Error("already gone");
      },
    });
    const adapter = createLocalModelAdapter({ getModel: () => fake.model });
    const session = await adapter.createSession(USER_SETUP);
    expect(() => adapter.destroyAll()).not.toThrow();
    expect(session.destroyed).toBe(true);
  });

  it("keeps working when a subscriber throws", async () => {
    const fake = fakeModel();
    const adapter = createLocalModelAdapter({ getModel: () => fake.model });
    adapter.subscribe(() => {
      throw new Error("listener exploded");
    });
    await expect(adapter.probe()).resolves.toBe("available");
  });

  it("stops notifying an unsubscribed listener", async () => {
    const events: LocalModelEvent[] = [];
    const fake = fakeModel();
    const adapter = createLocalModelAdapter({ getModel: () => fake.model });
    const off = adapter.subscribe((event) => events.push(event));
    await adapter.probe();
    off();
    await adapter.probe();
    expect(events).toHaveLength(1);
  });
});
