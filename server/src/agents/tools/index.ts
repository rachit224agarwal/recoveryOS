import { z } from "zod";
import { Transaction } from "../../models/transaction.js";
import { MerchantPolicy } from "../../models/policy.js";
import { AgentRun } from "../../models/agentRun.js";
import type { ITransaction } from "../../models/transaction.js";
import type { IMerchantPolicy } from "../../models/policy.js";
import { ApiError } from "../../utils/api.js";
import type { SimulatedActionResult, RecommendedAction } from "../../types/domain.js";

/**
 * Typed tool contracts used by the agent graph.
 *
 * Every tool: validated input → structured output → deterministic errors.
 * The LLM never invents results here; these functions ARE the results.
 */

const TransactionIdSchema = z.string().min(3).max(64);

export async function getTransaction(transactionId: string): Promise<ITransaction> {
  TransactionIdSchema.parse(transactionId);
  const txn = await Transaction.findOne({ transactionId }).lean<ITransaction>();
  if (!txn) throw new ApiError(404, "TRANSACTION_NOT_FOUND", `Transaction ${transactionId} not found`);
  return txn;
}

export interface PaymentHistorySummary {
  customerId: string;
  totalPrevious: number;
  successful: number;
  failed: number;
  historicalRecoveryRate: number;
}

export async function getPaymentHistory(txn: ITransaction): Promise<PaymentHistorySummary> {
  // Customer identity is synthetic; history is derived from the transaction's
  // own recorded counters rather than querying a real payments provider.
  return {
    customerId: txn.customerId,
    totalPrevious: txn.previousSuccessCount + txn.previousFailureCount,
    successful: txn.previousSuccessCount,
    failed: txn.previousFailureCount,
    historicalRecoveryRate: txn.historicalRecoveryRate,
  };
}

export async function getMerchantPolicy(merchantId: string): Promise<IMerchantPolicy> {
  const policy = await MerchantPolicy.findOne({ merchantId }).lean<IMerchantPolicy>();
  if (!policy) throw new ApiError(404, "POLICY_NOT_FOUND", `No policy configured for ${merchantId}`);
  return policy;
}

// --- Recoverability -------------------------------------------------------

export interface RecoverabilityEstimate {
  score: number;
  band: "high" | "medium" | "low";
  drivers: string[];
}

const CATEGORY_BASE_RATES: Record<string, number> = {
  temporary_failure: 0.62,
  insufficient_balance: 0.47,
  authentication_issue: 0.26,
  mandate_issue: 0.12,
  checkout_abandonment: 0.38,
  repeated_failure: 0.09,
  unknown: 0.22,
};

/** Deterministic recoverability scoring — no LLM involved. */
export function calculateRecoverability(
  txn: ITransaction,
  history: PaymentHistorySummary
): RecoverabilityEstimate {
  const drivers: string[] = [];
  let score = CATEGORY_BASE_RATES[txn.failureCategory] ?? 0.35;

  drivers.push(`Category base rate for "${txn.failureCategory}"`);

  const histWeight = Math.min(1, history.totalPrevious / 8);
  if (history.totalPrevious > 0) {
    const histScore = history.successful / history.totalPrevious;
    score = score * (1 - 0.35 * histWeight) + histScore * (0.35 * histWeight);
    drivers.push(
      `${history.successful}/${history.totalPrevious} previous payments succeeded`
    );
  }

  if (txn.previousAttemptCount > 0 || txn.failureCode === "REPEATED_DECLINE") {
    score *= 0.65;
    drivers.push(`${txn.previousAttemptCount} prior attempt(s) on this payment`);
  }

  if (txn.amount >= 50_000) {
    score *= 0.9;
    drivers.push("High-value payment (>₹50k)");
  }

  score = Math.min(0.98, Math.max(0.02, score));
  const band = score >= 0.6 ? "high" : score >= 0.35 ? "medium" : "low";

  return { score: Number(score.toFixed(3)), band, drivers };
}

// --- Execution actions ----------------------------------------------------

export interface ExecuteActionInput {
  transactionId: string;
  runId: string;
  actionType: Exclude<RecommendedAction, "no_action" | "escalate_to_human">;
  attemptNumber: number;
  recoveryProbability: number;
}

export async function executeSimulatedAction(input: ExecuteActionInput): Promise<{
  result: SimulatedActionResult;
  idempotencyKey: string;
}> {
  z.object({
    transactionId: z.string().min(3),
    runId: z.string().min(3),
    actionType: z.enum(["retry_payment", "schedule_retry", "create_payment_link", "send_recovery_notification"]),
    attemptNumber: z.number().int().min(1).max(10),
    recoveryProbability: z.number().min(0).max(1),
  }).parse(input);

  const txn = await getTransaction(input.transactionId);
  const idempotencyKey = `${input.transactionId}:${input.actionType}:${input.attemptNumber}`;

  // Idempotency: identical action+attempt must never double-execute.
  const duplicate = await AgentRun.findOne({
    "executedAction.idempotencyKey": idempotencyKey,
    status: { $in: ["completed", "awaiting_review"] },
  }).lean();
  if (duplicate && duplicate.runId !== input.runId) {
    throw new ApiError(
      409,
      "DUPLICATE_ACTION",
      `Action ${idempotencyKey} was already executed by run ${duplicate.runId}`
    );
  }

  const delayMs =
    input.actionType === "schedule_retry" ? 30 * 60 * 1000 : 0;

  const { getExecutionProvider } = await import("../../providers/execution.js");
  const result = await getExecutionProvider().execute({
    transactionId: txn.transactionId,
    runId: input.runId,
    idempotencyKey: delayMs ? `${idempotencyKey}:t+${delayMs}` : idempotencyKey,
    attemptNumber: txn.previousAttemptCount + input.attemptNumber,
    actionType: input.actionType,
    amount: txn.amount,
    recoveryProbability: input.recoveryProbability,
  });

  return { result, idempotencyKey };
}

export function escalateToHuman(input: {
  transactionId: string;
  runId: string;
  reason: string;
}): { escalated: true; queue: "merchant_ops_review"; reason: string } {
  z.object({ transactionId: z.string(), runId: z.string(), reason: z.string().min(1) }).parse(input);
  return { escalated: true as const, queue: "merchant_ops_review" as const, reason: input.reason };
}
