import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useReducer, useState } from "react";
import {
  COMMON_FIELDS,
  fieldsForGroups,
  getFieldValue,
  initialReviewState,
  projectEvaluateRequest,
  reviewReducer,
  type FieldDescriptor,
} from "@/client/review";
import { selectGroups } from "@/client/extraction/extract";
import type { MoneyInterval } from "@/shared/contracts";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Check your answers — Hidden Benefits Navigator" },
      {
        name: "description",
        content:
          "Look over what was understood from your words, correct anything that is wrong, and say what you don't know before any screening happens.",
      },
      { property: "og:title", content: "Check your answers — Hidden Benefits Navigator" },
      {
        property: "og:description",
        content:
          "Correct any fact, answer with \u201cI don't know\u201d, and nothing is sent until you confirm.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Review,
});

function centsToText(cents: number | null | undefined): string {
  return typeof cents === "number" ? String(Math.round(cents / 100)) : "";
}

function textToCents(text: string): number | null {
  const value = Number(text.trim());
  if (text.trim() === "" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function Review() {
  const [state, dispatch] = useReducer(reviewReducer, initialReviewState());
  const [note, setNote] = useState<string | null>(null);

  const fields = useMemo(
    () => fieldsForGroups(state.groupsAsked.length ? state.groupsAsked : selectGroups(state.facts)),
    [state.groupsAsked, state.facts],
  );

  const setField = (path: string, value: unknown) => dispatch({ type: "setField", path, value });

  const renderInput = (field: FieldDescriptor) => {
    const value = getFieldValue(state, field.path);
    const id = `f-${field.path}`;

    if (field.options) {
      const current =
        value === null || value === undefined ? "" : typeof value === "string" ? value : "";
      return (
        <select
          id={id}
          value={current}
          onChange={(e) => setField(field.path, e.target.value === "" ? null : e.target.value)}
          className="border-border mt-2 w-full rounded-md border px-3 py-2"
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.kind === "household" || field.kind === "count") {
      return (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) =>
            setField(field.path, e.target.value === "" ? null : Number(e.target.value))
          }
          className="border-border mt-2 w-full rounded-md border px-3 py-2"
        />
      );
    }

    const interval =
      field.kind === "income"
        ? ((value as { interval?: MoneyInterval } | null)?.interval ?? null)
        : ((value as MoneyInterval | null) ?? null);
    const period =
      field.kind === "income" ? ((value as { period?: string } | null)?.period ?? "monthly") : null;

    const writeMoney = (min: string, max: string) => {
      const minCents = textToCents(min);
      if (minCents === null) {
        setField(field.path, null);
        return;
      }
      const maxCents = textToCents(max);
      const next: MoneyInterval = { minCents, maxCents };
      if (field.kind === "income") {
        setField(field.path, {
          interval: next,
          period: period ?? "monthly",
          basis: (value as { basis?: string } | null)?.basis ?? "unknown",
        });
      } else {
        setField(field.path, next);
      }
    };

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          id={id}
          aria-label={`${field.label} — lowest`}
          type="number"
          inputMode="decimal"
          placeholder="Lowest"
          value={centsToText(interval?.minCents)}
          onChange={(e) => writeMoney(e.target.value, centsToText(interval?.maxCents))}
          className="border-border w-28 rounded-md border px-3 py-2"
        />
        <span className="text-muted-foreground text-sm">to</span>
        <input
          aria-label={`${field.label} — highest`}
          type="number"
          inputMode="decimal"
          placeholder="Highest"
          value={centsToText(interval?.maxCents)}
          onChange={(e) => writeMoney(centsToText(interval?.minCents), e.target.value)}
          className="border-border w-28 rounded-md border px-3 py-2"
        />
        {field.kind === "income" && (
          <select
            aria-label="How often"
            value={period ?? "monthly"}
            onChange={(e) =>
              setField(field.path, {
                interval: interval ?? { minCents: 0, maxCents: null },
                period: e.target.value,
                basis: (value as { basis?: string } | null)?.basis ?? "unknown",
              })
            }
            className="border-border rounded-md border px-3 py-2"
          >
            <option value="weekly">each week</option>
            <option value="biweekly">every two weeks</option>
            <option value="semimonthly">twice a month</option>
            <option value="monthly">each month</option>
            <option value="annual">each year</option>
          </select>
        )}
      </div>
    );
  };

  const confirmAndProject = () => {
    dispatch({ type: "confirm" });
    const projection = projectEvaluateRequest(
      { ...state, confirmed: true },
      {
        catalogVersion: "1.1.0",
        programIds: ["snap", "wic", "medicare_help", "lifeline", "eitc", "ceap"],
      },
    );
    setNote(
      projection.ok
        ? "Your answers are ready to be screened. Only the answers below would be sent — not what you typed."
        : "Something in the answers still needs fixing before screening.",
    );
  };

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Check your answers</h1>
      <p className="text-muted-foreground mt-3">
        Change anything that is wrong, and choose &ldquo;I don&rsquo;t know&rdquo; when you are not
        sure. Nothing is sent until you confirm.
      </p>

      <section aria-labelledby="story-heading" className="mt-10">
        <h2 id="story-heading" className="text-xl font-semibold">
          In your own words
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          This stays on your device. It is never sent anywhere.
        </p>
        <textarea
          aria-label="In your own words"
          value={state.narrative}
          onChange={(e) => dispatch({ type: "setNarrative", text: e.target.value })}
          rows={4}
          className="border-border mt-3 w-full rounded-md border px-3 py-2"
        />
      </section>

      <section aria-labelledby="facts-heading" className="mt-10">
        <h2 id="facts-heading" className="text-xl font-semibold">
          Your answers
        </h2>
        <ul className="mt-4 space-y-4">
          {fields.map((field) => (
            <li key={field.path} className="border-border rounded-lg border p-4">
              <label htmlFor={`f-${field.path}`} className="font-medium">
                {field.label}
              </label>
              {field.help && <p className="text-muted-foreground mt-1 text-sm">{field.help}</p>}
              {renderInput(field)}
              <p className="text-muted-foreground mt-2 text-xs">
                {state.ambiguous[field.path]
                  ? "Not clear yet — please check this one."
                  : state.origins[field.path] === "manual"
                    ? "You answered this."
                    : state.origins[field.path] === "confirmed"
                      ? "You checked this."
                      : state.origins[field.path] === "extracted"
                        ? "Understood from your words — please check."
                        : "Not answered yet."}
              </p>
              {state.lastRejectedPath === field.path && (
                <p className="mt-2 text-sm font-medium">
                  That answer is outside what this form accepts, so the previous one was kept.
                </p>
              )}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-4 text-sm">
          {COMMON_FIELDS.length} shared questions, plus the ones each programme needs.
        </p>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={confirmAndProject}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
        >
          These answers are right
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "reset" });
            setNote(null);
          }}
          className="border-border rounded-md border px-4 py-2 text-sm font-medium"
        >
          Start over
        </button>
      </div>
      {note && (
        <p aria-live="polite" className="mt-4 text-sm">
          {note}
        </p>
      )}
    </main>
  );
}
