/**
 * JSON Schema for on-device extraction, derived from the same Zod contracts the
 * server validates against. It is generated, never hand-maintained, so the
 * local model can never be asked for a field the contract does not accept.
 */

import { z } from "zod";
import {
  ceapExtensionSchema,
  eitcExtensionSchema,
  factsSchema,
  lifelineExtensionSchema,
  medicareExtensionSchema,
  programExtensionsSchema,
  snapExtensionSchema,
  wicExtensionSchema,
} from "./contracts";

export type JsonSchema = Record<string, unknown>;

type Def = { typeName: string; [key: string]: unknown };

function def(schema: z.ZodTypeAny): Def {
  return schema._def as unknown as Def;
}

export function toJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const d = def(schema);
  switch (d.typeName) {
    case "ZodEffects":
      return toJsonSchema(d["schema"] as z.ZodTypeAny);
    case "ZodOptional":
      return toJsonSchema(d["innerType"] as z.ZodTypeAny);
    case "ZodNullable": {
      const inner = toJsonSchema(d["innerType"] as z.ZodTypeAny);
      return { anyOf: [inner, { type: "null" }] };
    }
    case "ZodObject": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, JsonSchema> = {};
      for (const [key, value] of Object.entries(shape)) properties[key] = toJsonSchema(value);
      return {
        type: "object",
        properties,
        required: Object.keys(shape),
        additionalProperties: false,
      };
    }
    case "ZodArray": {
      const out: JsonSchema = { type: "array", items: toJsonSchema(d["type"] as z.ZodTypeAny) };
      const min = d["minLength"] as { value: number } | null;
      const max = d["maxLength"] as { value: number } | null;
      if (min) out["minItems"] = min.value;
      if (max) out["maxItems"] = max.value;
      return out;
    }
    case "ZodEnum":
      return { type: "string", enum: d["values"] as string[] };
    case "ZodLiteral":
      return { const: d["value"] };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodString": {
      const out: JsonSchema = { type: "string" };
      for (const check of (d["checks"] ?? []) as { kind: string; value?: number }[]) {
        if (check.kind === "min") out["minLength"] = check.value;
        if (check.kind === "max") out["maxLength"] = check.value;
      }
      return out;
    }
    case "ZodNumber": {
      const checks = (d["checks"] ?? []) as { kind: string; value?: number }[];
      const out: JsonSchema = {
        type: checks.some((c) => c.kind === "int") ? "integer" : "number",
      };
      for (const check of checks) {
        if (check.kind === "min") out["minimum"] = check.value;
        if (check.kind === "max") out["maximum"] = check.value;
      }
      return out;
    }
    case "ZodUnion": {
      const options = d["options"] as z.ZodTypeAny[];
      return { anyOf: options.map(toJsonSchema) };
    }
    default:
      throw new Error(`unsupported schema node: ${d.typeName}`);
  }
}

/**
 * What the local model may propose. Proposals are always reviewed by the person
 * before anything is sent anywhere; a proposal is never a confirmed fact.
 */
export const extractionJsonSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Proposed household facts",
  type: "object",
  properties: {
    facts: toJsonSchema(factsSchema),
    extensions: toJsonSchema(programExtensionsSchema),
  },
  required: ["facts", "extensions"],
  additionalProperties: false,
};

/* ----------------------------------------- bounded per-group extraction */

/**
 * Extraction happens in bounded passes: the common facts first, then only the
 * program groups a person's stated situation could actually need. Splitting the
 * schema keeps each prompt and each constrained answer small, and it means a
 * group that was never asked about stays at its explicit unknown defaults
 * instead of being filled in by a model that had no evidence for it.
 */
export type ExtractionGroup = "snap" | "eitc" | "ceap" | "medicare" | "wic" | "lifeline";

export const EXTRACTION_GROUPS: readonly ExtractionGroup[] = [
  "snap",
  "eitc",
  "ceap",
  "medicare",
  "wic",
  "lifeline",
] as const;

export const extensionZodByGroup: Readonly<Record<ExtractionGroup, z.ZodTypeAny>> = {
  snap: snapExtensionSchema,
  eitc: eitcExtensionSchema,
  ceap: ceapExtensionSchema,
  medicare: medicareExtensionSchema,
  wic: wicExtensionSchema,
  lifeline: lifelineExtensionSchema,
};

/** What the model may propose for the common facts, on its own. */
export const commonFactsJsonSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Proposed common household facts",
  type: "object",
  properties: { facts: toJsonSchema(factsSchema) },
  required: ["facts"],
  additionalProperties: false,
};

/** What the model may propose for one program group, on its own. */
export function groupJsonSchema(group: ExtractionGroup): JsonSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `Proposed ${group} details`,
    type: "object",
    properties: { [group]: toJsonSchema(extensionZodByGroup[group]) },
    required: [group],
    additionalProperties: false,
  };
}
