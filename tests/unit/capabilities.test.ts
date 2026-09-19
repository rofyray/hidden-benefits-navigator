import { describe, expect, it } from "vitest";
import {
  nanoStateFromAvailability,
  selectCapabilityPlan,
  type CapabilityReport,
  type CapabilityState,
} from "@/client/adapters/capabilities";

const report = (id: CapabilityReport["id"], state: CapabilityState): CapabilityReport => ({
  id,
  label: id,
  state,
  detail: "",
});

describe("nanoStateFromAvailability", () => {
  it("maps the documented values", () => {
    expect(nanoStateFromAvailability("available")).toBe("available");
    expect(nanoStateFromAvailability("downloadable")).toBe("downloadable");
    expect(nanoStateFromAvailability("downloading")).toBe("downloading");
    expect(nanoStateFromAvailability("unavailable")).toBe("unavailable");
  });

  it("never guesses for unrecognised or missing values", () => {
    expect(nanoStateFromAvailability(undefined)).toBe("unknown");
    expect(nanoStateFromAvailability("after-download")).toBe("unknown");
  });
});

describe("selectCapabilityPlan", () => {
  it("chooses voice only when speech and the on-device model are both ready", () => {
    expect(
      selectCapabilityPlan([
        report("nano", "available"),
        report("localSpeech", "available"),
        report("microphone", "available"),
      ]).plan,
    ).toBe("voice");
  });

  it("falls back to typed local input when the microphone is blocked", () => {
    expect(
      selectCapabilityPlan([
        report("nano", "available"),
        report("localSpeech", "available"),
        report("microphone", "denied"),
      ]).plan,
    ).toBe("typed-local");
  });

  it("falls back to the manual form when the on-device model is missing", () => {
    expect(
      selectCapabilityPlan([
        report("nano", "unsupported"),
        report("localSpeech", "available"),
        report("microphone", "available"),
      ]).plan,
    ).toBe("manual");
  });

  it("treats a downloadable model as not yet ready", () => {
    expect(
      selectCapabilityPlan([
        report("nano", "downloadable"),
        report("localSpeech", "available"),
        report("microphone", "available"),
      ]).plan,
    ).toBe("manual");
  });
});
