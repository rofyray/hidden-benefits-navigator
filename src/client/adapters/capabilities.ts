/**
 * Browser capability probes.
 *
 * Each capability is probed and reported separately; they are never collapsed
 * into a single "supported browser" boolean. Probes read no personal data and
 * never start a recording or an actual transcription.
 */

export type CapabilityState =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "denied"
  | "unsupported"
  | "unknown";

export type CapabilityReport = {
  id: "nano" | "localSpeech" | "microphone" | "localVoice";
  label: string;
  state: CapabilityState;
  detail: string;
};

type NanoAvailability = "available" | "downloadable" | "downloading" | "unavailable";

type LanguageModelLike = {
  availability?: () => Promise<NanoAvailability | string>;
  create?: (options?: unknown) => Promise<unknown>;
};

export function nanoStateFromAvailability(value: string | null | undefined): CapabilityState {
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

export function getLanguageModel(): LanguageModelLike | null {
  const candidate = (globalThis as Record<string, unknown>)["LanguageModel"];
  return candidate && typeof candidate === "object"
    ? (candidate as LanguageModelLike)
    : typeof candidate === "function"
      ? (candidate as unknown as LanguageModelLike)
      : null;
}

export async function probeNano(): Promise<CapabilityReport> {
  const base = { id: "nano", label: "On-device language model" } as const;
  const model = getLanguageModel();
  if (!model || typeof model.availability !== "function") {
    return {
      ...base,
      state: "unsupported",
      detail:
        "This browser does not offer an on-device language model. The typed form is used instead.",
    };
  }
  try {
    const state = nanoStateFromAvailability(await model.availability());
    return { ...base, state, detail: describeNano(state) };
  } catch {
    return {
      ...base,
      state: "unknown",
      detail: "The on-device model could not be checked. The typed form is used instead.",
    };
  }
}

function describeNano(state: CapabilityState): string {
  switch (state) {
    case "available":
      return "Ready. Your words can be understood on this device without leaving it.";
    case "downloadable":
      return "Available to download on this device. You choose whether to start the download.";
    case "downloading":
      return "Downloading now. The typed form works while you wait.";
    case "unavailable":
      return "Not available on this device right now. The typed form is used instead.";
    default:
      return "Could not be checked. The typed form is used instead.";
  }
}

export function probeLocalSpeech(): CapabilityReport {
  const w = globalThis as Record<string, unknown>;
  const ctor = w["SpeechRecognition"] ?? w["webkitSpeechRecognition"];
  if (!ctor) {
    return {
      id: "localSpeech",
      label: "Speaking instead of typing",
      state: "unsupported",
      detail: "This browser cannot turn speech into text. You can type your answers instead.",
    };
  }
  return {
    id: "localSpeech",
    label: "Speaking instead of typing",
    state: "available",
    detail: "Available. Speech stays on this device; we never switch it to an online service.",
  };
}

export async function probeMicrophone(): Promise<CapabilityReport> {
  const base = { id: "microphone", label: "Microphone permission" } as const;
  const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
  if (!permissions || typeof permissions.query !== "function") {
    return {
      ...base,
      state: "unknown",
      detail: "Permission state cannot be read without asking. You will be asked when you start.",
    };
  }
  try {
    const status = await permissions.query({ name: "microphone" as PermissionName });
    if (status.state === "granted")
      return { ...base, state: "available", detail: "Allowed on this site." };
    if (status.state === "denied")
      return {
        ...base,
        state: "denied",
        detail: "Blocked for this site. You can type your answers instead.",
      };
    return {
      ...base,
      state: "unknown",
      detail: "Not decided yet. You will be asked the first time you speak.",
    };
  } catch {
    return {
      ...base,
      state: "unknown",
      detail: "Permission state cannot be read in this browser.",
    };
  }
}

export function probeLocalVoice(): CapabilityReport {
  const synth = (globalThis as Record<string, unknown>)["speechSynthesis"] as
    SpeechSynthesis | undefined;
  if (!synth || typeof synth.getVoices !== "function") {
    return {
      id: "localVoice",
      label: "Reading results aloud",
      state: "unsupported",
      detail: "This browser cannot read results aloud. Everything is shown as text.",
    };
  }
  const voices = synth.getVoices();
  const local = voices.filter((v) => v.localService);
  if (local.length === 0) {
    return {
      id: "localVoice",
      label: "Reading results aloud",
      state: voices.length === 0 ? "unknown" : "unavailable",
      detail:
        voices.length === 0
          ? "Voices have not loaded yet. Try the check again in a moment."
          : "Only online voices were found, so results are not read aloud.",
    };
  }
  return {
    id: "localVoice",
    label: "Reading results aloud",
    state: "available",
    detail: `${local.length} on-device voice${local.length === 1 ? "" : "s"} found.`,
  };
}

export type CapabilityPlan = "voice" | "typed-local" | "manual";

export function selectCapabilityPlan(reports: CapabilityReport[]): {
  plan: CapabilityPlan;
  explanation: string;
} {
  const state = (id: CapabilityReport["id"]) => reports.find((r) => r.id === id)?.state;
  const speechReady = state("localSpeech") === "available" && state("microphone") !== "denied";
  const nanoReady = state("nano") === "available";
  if (speechReady && nanoReady)
    return {
      plan: "voice",
      explanation: "You can speak your answers and everything stays on this device.",
    };
  if (nanoReady)
    return {
      plan: "typed-local",
      explanation: "You can type your answers and they are understood on this device.",
    };
  return {
    plan: "manual",
    explanation:
      "You will answer a short set of questions on a form. Nothing is sent anywhere to understand them.",
  };
}
