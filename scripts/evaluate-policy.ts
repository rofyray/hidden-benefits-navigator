/**
 * Labeled policy evaluation (`bun run test:eval`).
 *
 * Runs the real `/api/evaluate` and `/api/verify` services over the labeled
 * development and held-out sets and reports exact counts.
 *
 * Two modes:
 *   mock (default)  Authored replies are served to the transport. No network.
 *   --live          The configured provider answers the real batches.
 *
 * The mock replies are authored replays — including deliberately wrong ones —
 * never snapshots treated as ground truth. A release-blocking failure (a false
 * strong match, or an unsupported draft approved) exits non-zero. So does an
 * unavailable live provider under `--live`: an unrun live evaluation is a
 * recorded release blocker, never a pass.
 *
 * Usage:
 *   bun scripts/evaluate-policy.ts [--live] [--set=dev|heldout|all] [--repeat=3]
 */

import { allPrograms, CATALOG_VERSION, programById } from "@/shared/catalog";
import { RULES_VERSION, screenProgram } from "@/shared/screening";
import type { Label, VerifyRequest } from "@/shared/contracts";
import { runEvaluation } from "@/server/evaluate";
import { runVerification } from "@/server/verify";
import { jevConfigured, PINNED_JEV_MODEL } from "@/server/jev/config";
import {
  matchQuestionId,
  relevanceQuestionId,
  POLICY_VERSION,
  QUESTION_VERSION,
} from "@/server/jev/policy";
import { DISPLAY_POLICY } from "@/server/jev/display";
import {
  VERIFICATION_POLICY,
  VERIFICATION_POLICY_VERSION,
  VERIFICATION_QUESTION_VERSION,
} from "@/server/jev/verification";
import { signEvaluationToken } from "@/server/token";
import { devLabelCases } from "../tests/fixtures/eval-dev-cases";
import { heldOutLabelCases } from "../tests/fixtures/eval-heldout-cases";
import {
  devVerifyCases,
  heldOutVerifyCases,
  type LabelEvalCase,
  type VerifyEvalCase,
} from "../tests/fixtures/eval-cases";
import { writeFileSync } from "node:fs";

const EVALUATION_DATE = "2026-09-19";
const NOW = 1_800_000_000;
const REPORT_PATH = "docs/evidence/P1-16-report.json";

/* ----------------------------------------------------------------- arguments */

const args = process.argv.slice(2);
const live = args.includes("--live");
const setArg = (args.find((a) => a.startsWith("--set=")) ?? "--set=all").slice(6);
const repeat = Number((args.find((a) => a.startsWith("--repeat=")) ?? "--repeat=1").slice(9)) || 1;

if (!["dev", "heldout", "all"].includes(setArg)) {
  console.error(`[eval] unknown --set=${setArg}; expected dev, heldout or all`);
  process.exit(1);
}

/* ------------------------------------------------------- mock transport setup */

type ReplyPlan =
  | {
      readonly kind: "score";
      readonly score: number;
      readonly confidence: number;
      readonly relevance: number;
    }
  | { readonly kind: "noul"; readonly noul: number };

let currentPlan: ReplyPlan | null = null;
const realFetch = globalThis.fetch;

/** Answers exactly the questions that were asked, in the validated envelope. */
function mockAnswers(body: string): unknown {
  const parsed = JSON.parse(body) as {
    questions: Record<string, { type: string; criteria?: unknown }>;
  };
  const answers: Record<string, unknown> = {};
  const plan = currentPlan;
  if (plan === null) throw new Error("no reply plan configured");

  for (const [id, question] of Object.entries(parsed.questions)) {
    if (question.type === "noul") {
      answers[id] = { type: "noul", noul: plan.kind === "noul" ? plan.noul : 0 };
      continue;
    }
    if (question.type !== "score" || plan.kind !== "score") {
      throw new Error(`unexpected question type for plan: ${question.type}`);
    }
    const criteria = question.criteria as string[];
    const value = id.endsWith("_relevance") ? plan.relevance : plan.score;
    const clamped = Math.max(0, Math.min(criteria.length - 1, value));
    // Probabilities are a plain, authored distribution around the stated score.
    const probabilities: Record<string, number> = {};
    const top = Math.round(clamped);
    criteria.forEach((_, index) => {
      probabilities[String(index)] = index === top ? 1 : 0;
    });
    answers[id] = { type: "score", score: clamped, confidence: plan.confidence, probabilities };
  }
  return { model: PINNED_JEV_MODEL, answers };
}

function installMockTransport(): void {
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "{}";
    return new Response(JSON.stringify(mockAnswers(body)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

/* ------------------------------------------------------------------ providers */

if (!live) {
  // Mock mode configures the transport and signing locally: synthetic values
  // only, so no real credential or hosted secret is involved.
  process.env["TYPESAFE_API_KEY"] = "mock-key-not-a-credential";
  process.env["JEV_MODEL"] = PINNED_JEV_MODEL;
  installMockTransport();
} else if (!jevConfigured()) {
  console.error(
    "[eval] --live requested but the provider is not configured. " +
      "An unrun live evaluation is a release blocker, not a pass.",
  );
  process.exit(1);
} else {
  globalThis.fetch = realFetch;
}

// Signing is required for `/verify` to bind a screening. In mock mode a local
// synthetic secret is used; in live mode the hosted secret is required.
if (!process.env["EVALUATION_TOKEN_SECRET"]) {
  if (live) {
    console.error("[eval] --live requires EVALUATION_TOKEN_SECRET; verification cannot be judged.");
    process.exit(1);
  }
  process.env["EVALUATION_TOKEN_SECRET"] = "synthetic-evaluation-secret-for-local-eval-only";
}

/* -------------------------------------------------------------- label scoring */

type LabelResult = {
  readonly id: string;
  readonly programId: string;
  readonly expected: Label;
  readonly actual: Label;
  readonly engine: "jev" | "rules";
  readonly falseStrongMatch: boolean;
  readonly matched: boolean;
  /** Set when a mismatch is attributed to a recorded defect, not a bad label. */
  readonly knownDefect?: string;
};

async function runLabelCase(testCase: LabelEvalCase): Promise<LabelResult> {
  currentPlan = {
    kind: "score",
    score: testCase.reply.score,
    confidence: testCase.reply.confidence,
    relevance: testCase.reply.relevance,
  };

  const outcome = await runEvaluation(
    {
      schemaVersion: "1",
      revision: 1,
      catalogVersion: CATALOG_VERSION,
      facts: testCase.facts,
      extensions: testCase.extensions,
      programIds: [testCase.programId as "snap"],
    },
    { evaluationDate: EVALUATION_DATE, nowSeconds: NOW },
  );

  const result = outcome.response.results.find((r) => r.programId === testCase.programId)!;
  return {
    id: testCase.id,
    programId: testCase.programId,
    expected: testCase.expected,
    actual: result.label,
    engine: outcome.response.engine,
    falseStrongMatch: testCase.strongMatchForbidden && result.label === "likely",
    matched: result.label === testCase.expected,
    ...(testCase.knownDefect ? { knownDefect: testCase.knownDefect } : {}),
  };
}

/* ------------------------------------------------------------- verify scoring */

type VerifyResult = {
  readonly id: string;
  readonly programId: string;
  readonly supported: boolean;
  readonly approved: boolean;
  readonly expectedApproved: boolean;
  readonly reasonCodes: readonly string[];
  readonly falseAccept: boolean;
  readonly falseReject: boolean;
};

async function tokenFor(programId: string): Promise<string> {
  const program = programById(programId)!;
  const screening = screenProgram({
    program,
    facts: devLabelCases[0]!.facts,
    extensions: devLabelCases[0]!.extensions,
    evaluationDate: EVALUATION_DATE,
  });
  const token = await signEvaluationToken(
    {
      revision: 1,
      catalogVersion: CATALOG_VERSION,
      rulesVersion: RULES_VERSION,
      screening: { [programId]: screening.criteria.map((c) => `${c.id}:${c.status}`) },
    },
    NOW,
  );
  if (!token) throw new Error("signing unavailable");
  return token;
}

async function runVerifyCase(testCase: VerifyEvalCase): Promise<VerifyResult> {
  currentPlan = { kind: "noul", noul: testCase.replyNoul };
  const isSentence = testCase.draft.kind === "sentence";
  const item = {
    id: testCase.draft.id,
    text: testCase.draft.text,
    evidenceIds: [...testCase.draft.evidenceIds],
  };

  const request = {
    schemaVersion: "1",
    revision: 1,
    catalogVersion: CATALOG_VERSION,
    evaluationToken: await tokenFor(testCase.programId),
    drafts: [
      {
        programId: testCase.programId,
        sentences: isSentence ? [item] : [],
        checklist: isSentence ? [] : [item],
      },
    ],
  } as VerifyRequest;

  const outcome = await runVerification(request, { nowSeconds: NOW });
  if (!outcome.ok) {
    return {
      id: testCase.id,
      programId: testCase.programId,
      supported: testCase.supported,
      approved: false,
      expectedApproved: testCase.expectApproved,
      reasonCodes: [`route.${outcome.error}`],
      falseAccept: false,
      falseReject: testCase.expectApproved,
    };
  }

  const program = outcome.response.programs[0]!;
  const approved = program.status === "approved";
  return {
    id: testCase.id,
    programId: testCase.programId,
    supported: testCase.supported,
    approved,
    expectedApproved: testCase.expectApproved,
    reasonCodes: program.reasonCodes,
    // A false accept is an unsupported draft that became visible text.
    falseAccept: approved && !testCase.supported,
    falseReject: !approved && testCase.supported,
  };
}

/* ------------------------------------------------------------------- reporting */

function confusion(results: readonly LabelResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of results) {
    const key = `${r.expected}->${r.actual}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

type SetReport = {
  readonly labelCases: number;
  readonly labelMatches: number;
  readonly confusion: Record<string, number>;
  readonly falseStrongMatches: readonly string[];
  readonly labelMismatches: readonly string[];
  /** Mismatches attributed to a recorded defect in curated data or screening. */
  readonly knownDefectMismatches: readonly string[];
  /** Mismatches with no recorded cause: these block the release. */
  readonly unexplainedLabelMismatches: readonly string[];
  /** Share of cases shown as "Possibly", the honest-uncertainty outcome. */
  readonly uncertainShare: number;
  readonly verifyCases: number;
  readonly verifyFalseAccepts: readonly string[];
  readonly verifyFalseRejects: readonly string[];
  readonly verifyUnexpected: readonly string[];
};

async function evaluateSet(
  labelCases: readonly LabelEvalCase[],
  verifyCases: readonly VerifyEvalCase[],
): Promise<SetReport> {
  const labelResults: LabelResult[] = [];
  for (const testCase of labelCases) labelResults.push(await runLabelCase(testCase));

  const verifyResults: VerifyResult[] = [];
  for (const testCase of verifyCases) verifyResults.push(await runVerifyCase(testCase));

  return {
    labelCases: labelResults.length,
    labelMatches: labelResults.filter((r) => r.matched).length,
    confusion: confusion(labelResults),
    falseStrongMatches: labelResults.filter((r) => r.falseStrongMatch).map((r) => r.id),
    labelMismatches: labelResults
      .filter((r) => !r.matched)
      .map((r) => `${r.id}: expected ${r.expected}, got ${r.actual}`),
    knownDefectMismatches: labelResults
      .filter((r) => !r.matched && r.knownDefect)
      .map((r) => `${r.id}: expected ${r.expected}, got ${r.actual} [${r.knownDefect}]`),
    unexplainedLabelMismatches: labelResults
      .filter((r) => !r.matched && !r.knownDefect)
      .map((r) => `${r.id}: expected ${r.expected}, got ${r.actual}`),

    uncertainShare:
      labelResults.length === 0
        ? 0
        : Number(
            (
              labelResults.filter((r) => r.actual === "possibly").length / labelResults.length
            ).toFixed(3),
          ),
    verifyCases: verifyResults.length,
    verifyFalseAccepts: verifyResults.filter((r) => r.falseAccept).map((r) => r.id),
    verifyFalseRejects: verifyResults.filter((r) => r.falseReject).map((r) => r.id),
    verifyUnexpected: verifyResults
      .filter((r) => r.approved !== r.expectedApproved)
      .map(
        (r) =>
          `${r.id}: expected ${r.expectedApproved ? "approved" : "fallback"}, got ${
            r.approved ? "approved" : "fallback"
          } [${r.reasonCodes.join(",")}]`,
      ),
  };
}

/* ------------------------------------------------------------------- execution */

const programs = allPrograms();
const devVerify = programs.flatMap((p) => devVerifyCases(p));
const heldOutVerify = programs.flatMap((p) => heldOutVerifyCases(p));

const runs: { readonly run: number; readonly dev?: SetReport; readonly heldout?: SetReport }[] = [];

for (let run = 1; run <= repeat; run += 1) {
  const entry: { run: number; dev?: SetReport; heldout?: SetReport } = { run };
  if (setArg === "dev" || setArg === "all") {
    entry.dev = await evaluateSet(devLabelCases, devVerify);
  }
  if (setArg === "heldout" || setArg === "all") {
    entry.heldout = await evaluateSet(heldOutLabelCases, heldOutVerify);
  }
  runs.push(entry);
}

const report = {
  task: "P1-16",
  mode: live ? "live" : "mock",
  set: setArg,
  repeats: repeat,
  generatedAt: new Date().toISOString(),
  versions: {
    catalogVersion: CATALOG_VERSION,
    rulesVersion: RULES_VERSION,
    questionVersion: QUESTION_VERSION,
    policyVersion: POLICY_VERSION,
    verificationQuestionVersion: VERIFICATION_QUESTION_VERSION,
    verificationPolicyVersion: VERIFICATION_POLICY_VERSION,
    model: PINNED_JEV_MODEL,
  },
  thresholds: { display: DISPLAY_POLICY, verification: VERIFICATION_POLICY },
  runs,
};

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

const blocking: string[] = [];
const recordedDefects: string[] = [];
for (const entry of runs) {
  for (const [name, set] of Object.entries({ dev: entry.dev, heldout: entry.heldout })) {
    if (!set) continue;
    console.log(
      `\n[eval:${report.mode}] run ${entry.run} · ${name}: ` +
        `${set.labelMatches}/${set.labelCases} labels matched, ` +
        `uncertain share ${set.uncertainShare}, ` +
        `${set.verifyCases} verification drafts`,
    );
    console.log(`  confusion: ${JSON.stringify(set.confusion)}`);
    for (const line of set.unexplainedLabelMismatches) console.log(`  label mismatch: ${line}`);
    for (const line of set.knownDefectMismatches) console.log(`  recorded defect: ${line}`);
    for (const line of set.verifyUnexpected) console.log(`  verify mismatch: ${line}`);
    if (set.falseStrongMatches.length > 0) {
      blocking.push(`${name}: false strong matches ${set.falseStrongMatches.join(", ")}`);
    }
    if (set.verifyFalseAccepts.length > 0) {
      blocking.push(`${name}: unsupported drafts approved ${set.verifyFalseAccepts.join(", ")}`);
    }
    if (set.unexplainedLabelMismatches.length > 0) {
      blocking.push(
        `${name}: ${set.unexplainedLabelMismatches.length} unexplained label mismatches`,
      );
    }
    if (set.verifyUnexpected.length > 0) {
      blocking.push(`${name}: ${set.verifyUnexpected.length} verification mismatches`);
    }
    for (const line of set.knownDefectMismatches) recordedDefects.push(`${name}: ${line}`);
  }
}

console.log(`\n[eval] report written to ${REPORT_PATH}`);

if (blocking.length > 0) {
  console.error(`\n[eval] FAILED — release-blocking findings:`);
  for (const line of blocking) console.error(`  - ${line}`);
  process.exit(1);
}

if (recordedDefects.length > 0) {
  console.error(
    `\n[eval] BLOCKED — seeded criteria met (zero false strong matches, zero ` +
      `unsupported-claim approvals), but recorded defects remain open:`,
  );
  for (const line of recordedDefects) console.error(`  - ${line}`);
  console.error("[eval] See docs/evidence/P1-16.md for each defect and its owning fix.");
  process.exit(2);
}

console.log("[eval] PASSED — zero false strong matches and zero unsupported-claim approvals.");
console.log(
  "[eval] These are small labeled synthetic sets. They are not a calibration " +
    "claim about real applicants.",
);
