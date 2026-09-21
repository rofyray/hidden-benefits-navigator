/**
 * The display gate.
 *
 * One batched verification call for all drafted programs, then one assembled
 * plan. A caller gets a plan in every case — verification approved, verification
 * refused, verification unavailable, or nothing drafted at all — so a failure is
 * never an empty screen, and prose that was not approved is never in the result.
 */

import { CATALOG_VERSION } from "@/shared/catalog";
import type { ComposedCard } from "@/client/compose";
import { postVerify, type VerifyClientOptions, type VerifyErrorCode } from "./client";
import { buildVerifyRequest } from "./request";
import { assemblePlan, type Plan } from "./plan";

export type GateOptions = VerifyClientOptions & {
  revision: number;
  evaluationToken: string;
  catalogVersion?: string;
};

export type GateResult = {
  plan: Plan;
  /** Absent when the batched verification answered successfully. */
  error?: VerifyErrorCode | "nothing_to_verify" | "invalid_request";
  retryable: boolean;
};

export async function gateDrafts(
  cards: readonly ComposedCard[],
  options: GateOptions,
): Promise<GateResult> {
  const built = buildVerifyRequest(cards, {
    revision: options.revision,
    catalogVersion: options.catalogVersion ?? CATALOG_VERSION,
    evaluationToken: options.evaluationToken,
  });

  if (!built.ok) {
    return {
      plan: assemblePlan(cards, {
        revision: options.revision,
        unverifiedReason: `verify.${built.reason}`,
      }),
      error: built.reason,
      retryable: false,
    };
  }

  const { revision: _r, evaluationToken: _t, catalogVersion: _c, ...clientOptions } = options;
  const outcome = await postVerify(built.request, clientOptions);

  if (!outcome.ok) {
    return {
      plan: assemblePlan(cards, {
        revision: options.revision,
        unverifiedReason: `verify.${outcome.code}`,
      }),
      error: outcome.code,
      retryable: outcome.retryable,
    };
  }

  return {
    plan: assemblePlan(cards, { verification: outcome.response, revision: options.revision }),
    retryable: false,
  };
}
