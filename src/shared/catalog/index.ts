/**
 * The bundled catalog.
 *
 * Program and source data are imported as modules, not read from disk: the
 * server runs in a bundled edge runtime with no runtime file resolution. Each
 * file is parsed with its schema on first access and cached, so a malformed
 * catalog fails loudly at the first request rather than producing silent gaps.
 */

import {
  manifestSchema,
  programSchema,
  sourceSchema,
  type Manifest,
  type Program,
  type Source,
} from "../catalog-schema";

import manifestJson from "./manifest.json";
import ceap from "./programs/ceap.json";
import eitc from "./programs/eitc.json";
import lifeline from "./programs/lifeline.json";
import medicareHelp from "./programs/medicare_help.json";
import snap from "./programs/snap.json";
import wic from "./programs/wic.json";
import ceapSources from "./sources/ceap.json";
import eitcSources from "./sources/eitc.json";
import lifelineSources from "./sources/lifeline.json";
import medicareSources from "./sources/medicare.json";
import snapSources from "./sources/snap.json";
import wicSources from "./sources/wic.json";

/** Stable catalog order; also the final ranking tie-break. */
export const PROGRAM_ORDER = ["snap", "wic", "eitc", "ceap", "medicare_help", "lifeline"] as const;

export type ProgramId = (typeof PROGRAM_ORDER)[number];

const RAW_PROGRAMS: Record<ProgramId, unknown> = {
  snap,
  wic,
  eitc,
  ceap,
  medicare_help: medicareHelp,
  lifeline,
};

const RAW_SOURCES: unknown[] = [
  snapSources,
  wicSources,
  eitcSources,
  ceapSources,
  medicareSources,
  lifelineSources,
].flat();

let programCache: Program[] | null = null;
let sourceCache: Source[] | null = null;

export const MANIFEST: Manifest = manifestSchema.parse(manifestJson);
export const CATALOG_VERSION = MANIFEST.catalogVersion;

export function allPrograms(): Program[] {
  if (programCache) return programCache;
  programCache = PROGRAM_ORDER.map((id) => programSchema.parse(RAW_PROGRAMS[id]));
  return programCache;
}

export function allSources(): Source[] {
  if (sourceCache) return sourceCache;
  sourceCache = RAW_SOURCES.map((raw) => sourceSchema.parse(raw));
  return sourceCache;
}

export function programById(id: string): Program | undefined {
  return allPrograms().find((p) => p.id === id);
}

export function catalogIndexOf(id: string): number {
  const index = (PROGRAM_ORDER as readonly string[]).indexOf(id);
  return index === -1 ? PROGRAM_ORDER.length : index;
}

/** Evidence whose source is unverified or expired cannot support a "Likely". */
export function programHasStaleEvidence(program: Program, evaluationDate: string): boolean {
  if (program.reviewDueOn < evaluationDate) return true;
  const sources = allSources();
  return program.evidence.some((evidence) => {
    return evidence.sourceIds.some((sourceId) => {
      const source = sources.find((s) => s.id === sourceId);
      return !source || source.reviewStatus !== "verified";
    });
  });
}
