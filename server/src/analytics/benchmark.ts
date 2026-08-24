import { Transaction } from "../models/transaction.js";
import { AgentRun } from "../models/agentRun.js";
import { EvalRun, type BenchmarkMetrics, type IEvalRun } from "../models/evalRun.js";
import type { ITransaction } from "../models/transaction.js";
import { newId } from "../utils/ids.js";
import { simulateAction } from "../simulator/simulator.js";
import { recommendDeterministically } from "../agents/recommendation/deterministic.js";
import { calculateRecoverability } from "../agents/tools/index.js";
import { classifyFailureCode } from "../types/domain.js";

/**
 * Offline evaluation: baseline vs agent over the synthetic dataset.
 *
 * Integrity notes:
 * - Runs fully deterministic (seeded) — reproducible.
 * - Uses the SAME decision core as the live agent's fallback path
 *   (recommendDeterministically + guardrail-equivalent caps + simulator).
 * - Hidden ground-truth labels are never given to the recommender; they are
 *   only used to COUNT unnecessary actions after decisions are made.
 */

interface Counters {
  eligible: number;
  recovered: number;
  revenueRecovered: number;
  retries: number;
  retriesOnNonRecoverable: number;
  escalations: number;
  actionsExecuted: number;
  successfulActions: number;
}

function emptyCounters(): Counters {
  return {
    eligible: 0,
    recovered: 0,
    revenueRecovered: 0,
    retries: 0,
    retriesOnNonRecoverable: 0,
    escalations: 0,
    actionsExecuted: 0,
    successfulActions: 0,
  };
}

function toMetrics(c: Counters): BenchmarkMetrics {
  return {
    recoveryRate: c.eligible ? c.recovered / c.eligible : 0,
    revenueRecovered: Math.round(c.revenueRecovered),
    retryAttempts: c.retries,
    unnecessaryRetries: c.retriesOnNonRecoverable,
    unnecessaryRetryRate: c.retries ? c.retriesOnNonRecoverable / c.retries : 0,
    escalations: c.escalations,
    escalationRate: c.eligible ? c.escalations / c.eligible : 0,
    actionSuccessRate: c.actionsExecuted ? c.successfulActions / c.actionsExecuted : 0,
    falsePositiveActions: c.retriesOnNonRecoverable,
  };
}

function runBaseline(txns: ITransaction[]): Counters {
  const c = emptyCounters();
  for (const txn of txns) {
    // Baseline policy: every failed payment gets exactly ONE blind retry
    // after a fixed delay — no diagnosis, no context, no escalation.
    if (txn.previousAttemptCount > 1) continue; // already worked by humans
    c.eligible++;
    c.retries++;
    const key = `baseline:${txn.transactionId}:retry_payment:1`;
    const result = simulateAction({
      transactionId: txn.transactionId,
      runId: "baseline",
      idempotencyKey: key,
      attemptNumber: txn.previousAttemptCount + 1,
      actionType: "retry_payment",
      amount: txn.amount,
      recoveryProbability: txn.recoveryProbability,
    });
    if (result.outcome === "SUCCESS") {
      c.recovered++;
      c.revenueRecovered += txn.amount;
      c.successfulActions++;
    }
    c.actionsExecuted++;
    if (txn.expectedRecoveryLabel === "non_recoverable") {
      c.retriesOnNonRecoverable++;
    }
  }
  return c;
}

function runAgent(txns: ITransaction[]): {
  counters: Counters;
  byCategory: Map<string, { eligible: number; recovered: number; rev: number }>;
  byMethod: Map<string, { eligible: number; recovered: number }>;
} {
  const c = emptyCounters();
  const byCategory = new Map<string, { eligible: number; recovered: number; rev: number }>();
  const byMethod = new Map<string, { eligible: number; recovered: number }>();

  for (const txn of txns) {
    if (txn.previousAttemptCount > 1) continue;
    c.eligible++;

    const catEntry = byCategory.get(txn.failureCategory) ?? { eligible: 0, recovered: 0, rev: 0 };
    const methodEntry = byMethod.get(txn.paymentMethod) ?? { eligible: 0, recovered: 0 };
    catEntry.eligible++;
    methodEntry.eligible++;

    // Agent decision core (identical module used inside the LangGraph node)
    const category = classifyFailureCode(txn.failureCode).category;
    const history = {
      customerId: txn.customerId,
      totalPrevious: txn.previousSuccessCount + txn.previousFailureCount,
      successful: txn.previousSuccessCount,
      failed: txn.previousFailureCount,
      historicalRecoveryRate: txn.historicalRecoveryRate,
    };
    const estimate = calculateRecoverability(txn, history);
    const rec = recommendDeterministically({
      category,
      recoverability: { score: estimate.score, band: estimate.band, drivers: [] },
      history,
      amount: txn.amount,
      previousAttemptCount: txn.previousAttemptCount,
      agentAttemptCount: 0,
    });

    let recoveredThis = false;

    const attempt = (actionType: typeof rec.recommendedAction, step: number) => {
      c.actionsExecuted++;
      const result = simulateAction({
        transactionId: txn.transactionId,
        runId: "benchmark",
        idempotencyKey: `agent:${txn.transactionId}:${actionType}:${step}`,
        attemptNumber: txn.previousAttemptCount + step,
        actionType,
        amount: txn.amount,
        recoveryProbability: txn.recoveryProbability,
      });
      if (result.outcome === "SUCCESS") {
        c.recovered++;
        c.revenueRecovered += txn.amount;
        c.successfulActions++;
        return true;
      }
      return false;
    };

    /**
     * Agent recovery ladder (bounded, policy-compliant):
     *   1. Primary context-aware action (retry / scheduled retry / payment link)
     *   2. If failed → one recovery notification
     *   3. If still failed AND high band → one self-serve payment link
     * Low-band txns get a single zero-cost notification nudge only.
     */
    if (
      rec.recommendedAction === "retry_payment" ||
      rec.recommendedAction === "schedule_retry" ||
      rec.recommendedAction === "create_payment_link"
    ) {
      if (rec.recommendedAction !== "create_payment_link") c.retries++;
      if (txn.expectedRecoveryLabel === "non_recoverable") {
        c.retriesOnNonRecoverable++;
      }
      recoveredThis = attempt(rec.recommendedAction, 1);
      if (!recoveredThis && estimate.band !== "low") {
        recoveredThis = attempt("send_recovery_notification", 2);
        if (!recoveredThis && estimate.band === "high") {
          recoveredThis = attempt("create_payment_link", 3);
        }
      }
    } else if (rec.recommendedAction === "send_recovery_notification") {
      // Auth issues in low band: single nudge, no money touched.
      recoveredThis = attempt("send_recovery_notification", 1);
    } else if (rec.recommendedAction === "escalate_to_human") {
      c.escalations++;
    }

    if (recoveredThis) {
      catEntry.recovered++;
      methodEntry.recovered++;
      catEntry.rev += txn.amount;
    }
    byCategory.set(txn.failureCategory, catEntry);
    byMethod.set(txn.paymentMethod, methodEntry);
  }

  return { counters: c, byCategory, byMethod };
}

export async function runBenchmark(options: {
  size?: number;
  seed?: number;
}): Promise<IEvalRun> {
  const size = Math.min(Math.max(options.size ?? 10_000, 100), 20_000);
  const startedAt = Date.now();

  const total = await Transaction.countDocuments({ status: { $ne: "analyzing" } });
  if (!total) throw new Error("Dataset is empty — run the seed script first");

  // Deterministic sample of the dataset (spread across the full set).
  const seed = options.seed ?? 42;
  const sampleSize = Math.min(size, total);
  const step = Math.max(1, Math.floor(total / sampleSize));
  const txns = await Transaction.find()
    .sort({ createdAt: -1 })
    .limit(sampleSize * step)
    .lean<ITransaction[]>();
  const sampled = txns.filter((_, i) => i % step === 0).slice(0, sampleSize);

  const baseline = runBaseline(sampled);
  const agentResult = runAgent(sampled);

  const evalRun: IEvalRun = {
    evalId: newId("eval"),
    seed,
    datasetSize: sampled.length,
    llmSpotChecks: 0,
    baseline: toMetrics(baseline),
    agent: toMetrics(agentResult.counters),
    byCategory: [...agentResult.byCategory.entries()].map(([category, v]) => ({
      category,
      baselineRecoveryRate: v.eligible ? v.recovered / v.eligible : 0,
      agentRecoveryRate: v.eligible ? v.recovered / v.eligible : 0,
      agentRevenueRecovered: v.rev,
    })),
    byMethod: [...agentResult.byMethod.entries()].map(([method, v]) => ({
      method,
      baselineRecoveryRate: v.eligible ? v.recovered / v.eligible : 0,
      agentRecoveryRate: v.eligible ? v.recovered / v.eligible : 0,
    })),
    createdAt: new Date(),
    durationMs: Date.now() - startedAt,
  };

  await EvalRun.create(evalRun);
  return evalRun;
}

export async function getLatestBenchmark(): Promise<IEvalRun | null> {
  return EvalRun.findOne().sort({ createdAt: -1 }).lean<IEvalRun | null>();
}
