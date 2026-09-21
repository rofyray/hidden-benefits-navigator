/**
 * P2-07 — display gating through server verification.
 *
 * Every case here is synthetic. No model answer is ever treated as ground
 * truth: the expected outcome is what the gate must do with a given server
 * verdict, not what a model happened to produce.
 */

import { describe, expect, it } from "vitest";
import { CATALOG_VERSION, programById } from "@/shared/catalog";
import { LIMITS, SCHEMA_VERSION, type VerifyResponse } from "@/shared/contracts";
import type { ComposedCard, DraftItem, ProgramDraft } from "@/client/compose";
import {
  assemblePlan,
  buildVerifyRequest,
  displayableText,
  gateDrafts,
  postVerify,
  sanitizeDraftText,
} from "@/client/verify";

const TOKEN = "synthetic.evaluation.token";

function item(id: string, text: string, evidenceIds = ["ev-1"]): DraftItem {
  return { id, text, evidenceIds };
}

function draft(programId: string, overrides: Partial<ProgramDraft> = {}): ProgramDraft {
  return {
    programId,
    sentences: [item("s1", "You may be able to get help with food costs.")],
    checklist: [item("c1", "Bring proof of who lives with you.")],
    ...overrides,
  };
}

function modelCard(programId: string, overrides: Partial<ProgramDraft> = {}): ComposedCard {
  return {
    programId,
    source: "model",
    draft: draft(programId, overrides),
    curated: null,
  };
}

function curatedComposed(programId: string): ComposedCard {
  return { programId, source: "curated", failure: "timed_out", curated: null };
}

function verdict(
  programId: string,
  overrides: Partial<VerifyResponse["programs"][number]> = {},
): VerifyResponse["programs"][number] {
  return {
    programId: programId as VerifyResponse["programs"][number]["programId"],
    status: "approved",
    approvedSentenceIds: ["s1"],
    approvedChecklistIds: ["c1"],
    reasonCodes: [],
    ...overrides,
  };
}

function response(
  programs: VerifyResponse["programs"],
  overrides: Partial<VerifyResponse> = {},
): VerifyResponse {
  return { revision: 1, engine: "jev", model: "jev-model", programs, ...overrides };
}

function jsonFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("request building", () => {
  it("sends one batched request covering every drafted program", () => {
    const built = buildVerifyRequest([modelCard("snap"), modelCard("wic"), modelCard("eitc")], {
      revision: 3,
      catalogVersion: CATALOG_VERSION,
      evaluationToken: TOKEN,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.drafts).toHaveLength(3);
    expect(built.request.schemaVersion).toBe(SCHEMA_VERSION);
    expect(built.request.revision).toBe(3);
  });

  it("carries the evaluation token exactly as issued", () => {
    const built = buildVerifyRequest([modelCard("snap")], {
      revision: 1,
      catalogVersion: CATALOG_VERSION,
      evaluationToken: TOKEN,
    });
    expect(built.ok && built.request.evaluationToken).toBe(TOKEN);
  });

  it("never submits a card that already fell back to curated prose", () => {
    const built = buildVerifyRequest([modelCard("snap"), curatedComposed("wic")], {
      revision: 1,
      catalogVersion: CATALOG_VERSION,
      evaluationToken: TOKEN,
    });
    expect(built.ok && built.submittedProgramIds).toEqual(["snap"]);
  });

  it("reports nothing to verify when no card was drafted", () => {
    const built = buildVerifyRequest([curatedComposed("snap")], {
      revision: 1,
      catalogVersion: CATALOG_VERSION,
      evaluationToken: TOKEN,
    });
    expect(built).toEqual({ ok: false, reason: "nothing_to_verify" });
  });

  it("sanitizes control characters and whitespace runs", () => {
    expect(sanitizeDraftText("You  may\n\tqualify.\u0000")).toBe("You may qualify.");
  });

  it("caps sanitized text at the contract length", () => {
    expect(sanitizeDraftText("a".repeat(500))).toHaveLength(LIMITS.maxSentenceChars);
  });

  it("drops an item whose text still looks like a link", () => {
    const built = buildVerifyRequest(
      [
        modelCard("snap", {
          sentences: [item("s1", "Apply at https://example.gov/apply now.")],
          checklist: [item("c1", "Bring a photo ID.")],
        }),
      ],
      { revision: 1, catalogVersion: CATALOG_VERSION, evaluationToken: TOKEN },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.request.drafts[0]!.sentences).toHaveLength(0);
    expect(built.request.drafts[0]!.checklist).toHaveLength(1);
  });

  it("refuses a card whose every item was dropped", () => {
    const built = buildVerifyRequest(
      [
        modelCard("snap", {
          sentences: [item("s1", "Call 512-555-0134 today.")],
          checklist: [item("c1", "See www.example.gov.")],
        }),
      ],
      { revision: 1, catalogVersion: CATALOG_VERSION, evaluationToken: TOKEN },
    );
    expect(built).toEqual({ ok: false, reason: "nothing_to_verify" });
  });
});

describe("plan assembly", () => {
  it("shows drafted sentences only when the server approved their IDs", () => {
    const plan = assemblePlan([modelCard("snap")], {
      revision: 1,
      verification: response([verdict("snap")]),
    });
    expect(plan.cards[0]!.approvalMode).toBe("verified");
    expect(plan.cards[0]!.sentences).toEqual(["You may be able to get help with food costs."]);
  });

  it("withholds a sentence the server did not approve", () => {
    const card = modelCard("snap", {
      sentences: [item("s1", "Approved sentence."), item("s2", "Unsupported sentence.")],
    });
    const plan = assemblePlan([card], {
      revision: 1,
      verification: response([verdict("snap", { approvedSentenceIds: ["s1"] })]),
    });
    expect(displayableText(plan.cards[0]!)).not.toContain("Unsupported sentence.");
  });

  it("replaces the whole card with curated prose on a fallback verdict", () => {
    const plan = assemblePlan([modelCard("snap")], {
      revision: 1,
      verification: response([
        verdict("snap", { status: "fallback", reasonCodes: ["verify.unsupported_claim"] }),
      ]),
    });
    const card = plan.cards[0]!;
    expect(card.approvalMode).toBe("curated");
    expect(card.sentences).toEqual([]);
    expect(card.explanation).toBe(programById("snap")!.fallbackExplanation);
    expect(card.reasonCodes).toEqual(["verify.unsupported_claim"]);
  });

  it("does not speak or show any drafted text on a fallback card", () => {
    const card = modelCard("snap", { sentences: [item("s1", "Invented promise of $500.")] });
    const plan = assemblePlan([card], {
      revision: 1,
      verification: response([verdict("snap", { status: "fallback" })]),
    });
    expect(displayableText(plan.cards[0]!).join(" ")).not.toContain("Invented promise");
  });

  it("keeps an approved card when another card fails", () => {
    const plan = assemblePlan([modelCard("snap"), modelCard("wic")], {
      revision: 1,
      verification: response([verdict("snap"), verdict("wic", { status: "fallback" })]),
    });
    expect(plan.cards[0]!.approvalMode).toBe("verified");
    expect(plan.cards[1]!.approvalMode).toBe("curated");
    expect(plan.approvedCount).toBe(1);
    expect(plan.fallbackCount).toBe(1);
  });

  it("falls back when the response carries no verdict for a submitted card", () => {
    const plan = assemblePlan([modelCard("snap"), modelCard("wic")], {
      revision: 1,
      verification: response([verdict("snap")]),
    });
    expect(plan.cards[1]!.approvalMode).toBe("curated");
    expect(plan.cards[1]!.reasonCodes).toEqual(["verify.not_verified"]);
  });

  it("falls back when an approved verdict approves no sentence at all", () => {
    const plan = assemblePlan([modelCard("snap")], {
      revision: 1,
      verification: response([verdict("snap", { approvedSentenceIds: [] })]),
    });
    expect(plan.cards[0]!.approvalMode).toBe("curated");
    expect(plan.cards[0]!.reasonCodes).toEqual(["verify.no_approved_sentences"]);
  });

  it("uses curated prose with no verification at all", () => {
    const plan = assemblePlan([modelCard("snap")], { revision: 4 });
    expect(plan.cards[0]!.approvalMode).toBe("curated");
    expect(plan.engine).toBe("rules");
    expect(plan.model).toBeNull();
    expect(plan.revision).toBe(4);
  });

  it("records the compose failure code on a card that was never drafted", () => {
    const plan = assemblePlan([curatedComposed("wic")], { revision: 1 });
    expect(plan.cards[0]!.reasonCodes).toEqual(["compose.timed_out"]);
  });

  it("selects official value and links from the catalog, not from the draft", () => {
    const program = programById("snap")!;
    const plan = assemblePlan([modelCard("snap")], {
      revision: 1,
      verification: response([verdict("snap")]),
    });
    expect(plan.cards[0]!.officialValue).toBe(program.value.text);
    expect(plan.cards[0]!.links.map((l) => l.url)).toEqual(program.application.map((a) => a.url));
    for (const link of plan.cards[0]!.links) expect(link.url.startsWith("https://")).toBe(true);
  });

  it("exposes the content approval mode per card", () => {
    const plan = assemblePlan([modelCard("snap"), curatedComposed("wic")], {
      revision: 1,
      verification: response([verdict("snap")]),
    });
    expect(plan.cards.map((c) => c.approvalMode)).toEqual(["verified", "curated"]);
  });

  it("reports the engine and model the verification used", () => {
    const plan = assemblePlan([modelCard("snap")], {
      revision: 1,
      verification: response([verdict("snap")], { engine: "rules", model: null }),
    });
    expect(plan.engine).toBe("rules");
    expect(plan.model).toBeNull();
  });
});

describe("verification client", () => {
  it("accepts a contract-shaped response", async () => {
    const outcome = await postVerify(
      {
        schemaVersion: SCHEMA_VERSION,
        revision: 1,
        catalogVersion: CATALOG_VERSION,
        evaluationToken: TOKEN,
        drafts: [{ programId: "snap", sentences: [item("s1", "Hello.")], checklist: [] }],
      },
      { fetchImpl: jsonFetch(200, response([verdict("snap")])) },
    );
    expect(outcome.ok).toBe(true);
  });

  it("refuses a malformed response", async () => {
    const outcome = await postVerify(
      {
        schemaVersion: SCHEMA_VERSION,
        revision: 1,
        catalogVersion: CATALOG_VERSION,
        evaluationToken: TOKEN,
        drafts: [{ programId: "snap", sentences: [item("s1", "Hello.")], checklist: [] }],
      },
      { fetchImpl: jsonFetch(200, { revision: 1, programs: "nope" }) },
    );
    expect(outcome).toMatchObject({ ok: false, code: "invalid_response" });
  });

  it("refuses an answer for another revision", async () => {
    const outcome = await postVerify(
      {
        schemaVersion: SCHEMA_VERSION,
        revision: 7,
        catalogVersion: CATALOG_VERSION,
        evaluationToken: TOKEN,
        drafts: [{ programId: "snap", sentences: [item("s1", "Hello.")], checklist: [] }],
      },
      { fetchImpl: jsonFetch(200, response([verdict("snap")], { revision: 6 })) },
    );
    expect(outcome).toMatchObject({ ok: false, code: "revision_mismatch" });
  });

  it("maps the server's error codes and retryability", async () => {
    const cases: [number, unknown, string, boolean][] = [
      [400, { error: "invalid_request" }, "invalid_request", false],
      [403, { error: "forbidden_origin" }, "forbidden_origin", false],
      [409, { error: "catalog_changed" }, "catalog_changed", false],
      [409, { error: "reevaluate_required" }, "reevaluate_required", false],
      [413, { error: "payload_too_large" }, "payload_too_large", false],
      [429, { error: "rate_limited" }, "rate_limited", true],
      [503, { error: "busy" }, "busy", true],
      [500, { error: "verification_failed" }, "server_error", true],
    ];
    for (const [status, body, code, retryable] of cases) {
      const outcome = await postVerify(
        {
          schemaVersion: SCHEMA_VERSION,
          revision: 1,
          catalogVersion: CATALOG_VERSION,
          evaluationToken: TOKEN,
          drafts: [{ programId: "snap", sentences: [item("s1", "Hello.")], checklist: [] }],
        },
        { fetchImpl: jsonFetch(status, body) },
      );
      expect(outcome).toMatchObject({ ok: false, code, retryable });
    }
  });
});

describe("gate", () => {
  it("makes exactly one verification call for all drafted programs", async () => {
    let calls = 0;
    const result = await gateDrafts([modelCard("snap"), modelCard("wic")], {
      revision: 1,
      evaluationToken: TOKEN,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        calls += 1;
        const body = JSON.parse(String(init.body)) as { drafts: unknown[] };
        expect(body.drafts).toHaveLength(2);
        return new Response(JSON.stringify(response([verdict("snap"), verdict("wic")])), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(1);
    expect(result.plan.approvedCount).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("returns a curated plan, not an empty one, when verification is unavailable", async () => {
    const result = await gateDrafts([modelCard("snap")], {
      revision: 1,
      evaluationToken: TOKEN,
      fetchImpl: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    expect(result.error).toBe("network_error");
    expect(result.retryable).toBe(true);
    expect(result.plan.cards).toHaveLength(1);
    expect(result.plan.cards[0]!.approvalMode).toBe("curated");
    expect(result.plan.cards[0]!.explanation).not.toBeNull();
  });

  it("skips the call and returns curated cards when nothing was drafted", async () => {
    let calls = 0;
    const result = await gateDrafts([curatedComposed("snap")], {
      revision: 1,
      evaluationToken: TOKEN,
      fetchImpl: (async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(calls).toBe(0);
    expect(result.error).toBe("nothing_to_verify");
    expect(result.plan.cards[0]!.approvalMode).toBe("curated");
  });

  it("never leaks drafted prose into a plan built from a refused verification", async () => {
    const card = modelCard("snap", { sentences: [item("s1", "You will definitely be approved.")] });
    const result = await gateDrafts([card], {
      revision: 1,
      evaluationToken: TOKEN,
      fetchImpl: jsonFetch(500, { error: "verification_failed" }),
    });
    const text = result.plan.cards.flatMap(displayableText).join(" ");
    expect(text).not.toContain("definitely be approved");
  });
});
