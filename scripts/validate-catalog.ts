/**
 * `data:validate` — parse and cross-validate the catalog on disk.
 *
 * Exits non-zero on any schema failure or `error` issue. `unsupported` issues
 * are reported honestly and demote entries to referrals rather than silently
 * passing as full screening.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  manifestSchema,
  programSchema,
  sourceSchema,
  validateCatalog,
  type Program,
  type Source,
} from "../src/shared/catalog-schema";

const ROOT = join(process.cwd(), "src/shared/catalog");
const PROGRAMS_DIR = join(ROOT, "programs");
const SOURCES_DIR = join(ROOT, "sources");
const REQUIRED_PROGRAMS = ["snap", "eitc", "ceap", "medicare_help", "wic", "lifeline"];

function readJsonFiles(dir: string): { file: string; data: unknown }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((file) => {
      const parsed = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown;
      return Array.isArray(parsed)
        ? parsed.map((data) => ({ file, data: data as unknown }))
        : [{ file, data: parsed }];
    });
}

function main(): number {
  const evaluationDate = process.env["EVALUATION_DATE"] ?? new Date().toISOString().slice(0, 10);
  let failed = false;

  const sources: Source[] = [];
  for (const { file, data } of readJsonFiles(SOURCES_DIR)) {
    const parsed = sourceSchema.safeParse(data);
    if (!parsed.success) {
      failed = true;
      console.error(
        `source ${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
      continue;
    }
    sources.push(parsed.data);
  }

  const programs: Program[] = [];
  for (const { file, data } of readJsonFiles(PROGRAMS_DIR)) {
    const parsed = programSchema.safeParse(data);
    if (!parsed.success) {
      failed = true;
      console.error(
        `program ${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
      continue;
    }
    programs.push(parsed.data);
  }

  const manifestPath = join(ROOT, "manifest.json");
  if (existsSync(manifestPath)) {
    const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, "utf8")));
    if (!parsed.success) {
      failed = true;
      console.error(`manifest: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    }
  } else {
    console.warn("manifest.json is not present yet");
  }

  for (const issue of validateCatalog(programs, { evaluationDate, sources })) {
    const line = `${issue.severity.toUpperCase()} ${issue.programId} ${issue.code}: ${issue.detail}`;
    if (issue.severity === "error") {
      failed = true;
      console.error(line);
    } else {
      console.warn(line);
    }
  }

  const present = new Set(programs.map((p) => p.id));
  const missing = REQUIRED_PROGRAMS.filter((id) => !present.has(id as Program["id"]));
  console.log(
    `checked ${programs.length} program file(s) and ${sources.length} source record(s) against ${evaluationDate}`,
  );
  if (missing.length > 0) console.warn(`not encoded yet: ${missing.join(", ")}`);

  return failed ? 1 : 0;
}

process.exit(main());
