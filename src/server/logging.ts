/**
 * Content-free server logging.
 *
 * Never pass transcripts, facts, generated prose, tokens, secrets or provider
 * error bodies to these helpers. Only route name, outcome code, active mode,
 * versions, counts and durations are permitted.
 */

const ALLOWED_FIELDS = new Set([
  "route",
  "outcome",
  "mode",
  "durationMs",
  "catalogVersion",
  "schemaVersion",
  "modelVersion",
  "count",
  "status",
]);

export type LogFields = {
  route: string;
  outcome: string;
  mode?: string;
  durationMs?: number;
  catalogVersion?: string;
  schemaVersion?: string;
  modelVersion?: string;
  count?: number;
  status?: number;
};

function sanitize(fields: LogFields): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (typeof value === "number") {
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      // Bound the length so an accidental payload cannot be logged whole.
      out[key] = value.slice(0, 64);
    }
  }
  return out;
}

export function logEvent(level: "info" | "warn" | "error", fields: LogFields): void {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...sanitize(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
