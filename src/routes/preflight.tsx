import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getLanguageModel,
  probeLocalSpeech,
  probeLocalVoice,
  probeMicrophone,
  probeNano,
  selectCapabilityPlan,
  type CapabilityReport,
  type CapabilityState,
} from "@/client/adapters/capabilities";
import { probeJev, type JevProbeResult } from "@/lib/preflight.functions";

export const Route = createFileRoute("/preflight")({
  head: () => ({
    meta: [
      { title: "Device check — Hidden Benefits Navigator" },
      {
        name: "description",
        content:
          "Check what this device can do — speaking, on-device understanding, microphone and reading aloud — and see which way of answering will be used.",
      },
      { property: "og:title", content: "Device check — Hidden Benefits Navigator" },
      {
        property: "og:description",
        content:
          "See what this device supports and which way of answering questions will be used. Nothing is recorded during the check.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Preflight,
});

const STATE_LABEL: Record<CapabilityState, string> = {
  available: "Ready",
  downloadable: "Can be downloaded",
  downloading: "Downloading",
  unavailable: "Not available",
  denied: "Blocked",
  unsupported: "Not supported here",
  unknown: "Not known yet",
};

function Preflight() {
  const [reports, setReports] = useState<CapabilityReport[] | null>(null);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const [jev, setJev] = useState<JevProbeResult | "running" | null>(null);
  const runJevProbe = useServerFn(probeJev);

  const runChecks = useCallback(async () => {
    const [nano, microphone] = await Promise.all([probeNano(), probeMicrophone()]);
    setReports([nano, probeLocalSpeech(), microphone, probeLocalVoice()]);
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const nano = reports?.find((r) => r.id === "nano");
  const plan = reports ? selectCapabilityPlan(reports) : null;

  const startDownload = async () => {
    const model = getLanguageModel();
    if (!model || typeof model.create !== "function") return;
    setDownloadNote("Starting the download…");
    try {
      await model.create({
        monitor: (m: EventTarget) =>
          m.addEventListener("downloadprogress", (event: Event) => {
            const loaded = (event as Event & { loaded?: number }).loaded ?? 0;
            setDownloadNote(`Downloading… ${Math.round(loaded * 100)}%`);
          }),
      });
      setDownloadNote("Download finished. Re-running the check.");
      await runChecks();
    } catch {
      setDownloadNote(
        "The download could not be started on this device. The typed form still works.",
      );
    }
  };

  const askForMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // A refusal is a valid outcome; the re-check below records it.
    }
    await runChecks();
  };

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Device check</h1>
      <p className="text-muted-foreground mt-3">
        This page checks what this device can do. Nothing is recorded and nothing you say or type is
        sent anywhere during the check.
      </p>

      <section aria-labelledby="caps-heading" className="mt-10">
        <h2 id="caps-heading" className="text-xl font-semibold">
          What this device supports
        </h2>
        {reports === null ? (
          <p className="text-muted-foreground mt-4">Checking…</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="border-border rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{report.label}</p>
                  <p className="text-muted-foreground text-sm">{STATE_LABEL[report.state]}</p>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">{report.detail}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runChecks()}
            className="border-border rounded-md border px-4 py-2 text-sm font-medium"
          >
            Run the check again
          </button>
          {(nano?.state === "downloadable" || nano?.state === "downloading") && (
            <button
              type="button"
              onClick={() => void startDownload()}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
            >
              Download the on-device model
            </button>
          )}
          <button
            type="button"
            onClick={() => void askForMicrophone()}
            className="border-border rounded-md border px-4 py-2 text-sm font-medium"
          >
            Ask for microphone access
          </button>
        </div>
        {downloadNote && (
          <p aria-live="polite" className="text-muted-foreground mt-3 text-sm">
            {downloadNote}
          </p>
        )}
      </section>

      <section aria-labelledby="plan-heading" className="mt-10">
        <h2 id="plan-heading" className="text-xl font-semibold">
          How you will answer
        </h2>
        <p className="mt-3">
          {plan ? plan.explanation : "Waiting for the checks above to finish."}
        </p>
      </section>

      <section aria-labelledby="jev-heading" className="mt-10">
        <h2 id="jev-heading" className="text-xl font-semibold">
          Screening service check
        </h2>
        <p className="text-muted-foreground mt-3 text-sm">
          Sends one tiny test question that contains no personal information, to confirm the
          screening service is reachable.
        </p>
        <button
          type="button"
          onClick={() => {
            setJev("running");
            void runJevProbe({}).then(setJev);
          }}
          className="border-border mt-4 rounded-md border px-4 py-2 text-sm font-medium"
        >
          Run the service check
        </button>
        <p aria-live="polite" className="mt-3 text-sm">
          {jev === "running"
            ? "Checking…"
            : jev === null
              ? ""
              : jev.ok
                ? `Reachable. Version reported: ${jev.model ?? "not reported"}.`
                : jev.configured
                  ? `Not reachable right now (${jev.code}). Screening falls back to the written rules, clearly labelled.`
                  : "No credential is set up here, so screening falls back to the written rules, clearly labelled."}
        </p>
      </section>
    </main>
  );
}
