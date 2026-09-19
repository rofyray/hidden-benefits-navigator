/**
 * `data:manifest` — regenerate `src/shared/catalog/manifest.json`.
 *
 * The manifest pins one catalog version and a content hash per program file, so
 * a client and an evaluation token can be checked against the exact data the
 * server holds. Run it after any catalog edit; `data:validate` parses the result.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { programSchema, type Manifest } from "../src/shared/catalog-schema";

const ROOT = join(process.cwd(), "src/shared/catalog");
const PROGRAM_IDS = ["snap", "eitc", "ceap", "medicare_help", "wic", "lifeline"] as const;

const CATALOG_VERSION = process.env["CATALOG_VERSION"] ?? "1.0.0";
const RULES_VERSION = "1.0.0";

const programs = PROGRAM_IDS.map((id) => {
  const raw = readFileSync(join(ROOT, "programs", `${id}.json`), "utf8");
  const parsed = programSchema.parse(JSON.parse(raw));
  return {
    id: parsed.id,
    version: parsed.version,
    // Hash the file bytes: any edit, including whitespace, changes the hash.
    contentHash: createHash("sha256").update(raw).digest("hex"),
  };
});

const manifest: Manifest = {
  catalogVersion: CATALOG_VERSION,
  rulesVersion: RULES_VERSION,
  builtOn: new Date().toISOString().slice(0, 10),
  programs,
};

writeFileSync(join(ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote manifest ${manifest.catalogVersion} for ${programs.length} program(s)`);
