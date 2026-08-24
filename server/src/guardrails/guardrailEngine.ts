import type {
  GuardrailCheck,
  GuardrailResult,
  RecoveryRecommendation,
} from "../types/domain.js";
import type { ITransaction } from "../models/transaction.js";
import type { IMerchantPolicy } from "../models/policy.js";

export interface GuardrailContext {
  recommendation: RecoveryRecommendation;
  transaction: ITransaction;
  policy: IMerchantPolicy;
  /** Attempts already made by the agent on this transaction (across runs). */
  agentAttemptCount: number;
  /** Idempotency keys of previously executed/scheduled actions for this txn. */
  priorIdempotencyKeys: string[];
  /** Proposed delay in minutes (schedule_retry only). */
  proposedDelayMinutes?: number;
}

const RETRY_LIKE = new Set(["retry_payment", "schedule_retry"]);
/** Actions that never move money and are always permitted by policy. */
const NON_CONSEQUENTIAL = new Set(["no_action", "escalate_to_human"]);

/**
 * Deterministic guardrail engine.
 *
 * This is ordinary TypeScript. The LLM cannot reach it, influence it, or
 * bypass it — every consequential action must pass through here, and the
 * decision is recorded verbatim in the audit trail.
 *
 * Two classes of outcomes:
 * - BLOCKING violations (policy limits, duplicates, disallowed actions) → BLOCK
 * - Approval requirements (high-value, low confidence, high risk) → HUMAN_REVIEW
 */
export function evaluateGuardrails(ctx: GuardrailContext): GuardrailResult {
  const { recommendation: rec, transaction: txn, policy } = ctx;
  const checks: GuardrailCheck[] = [];
  const blockReasons: string[] = [];
  let needsReview = false;

  const record = (name: string, detail: string) => checks.push({ name, passed: true, detail });
  const block = (name: string, detail: string) => {
    checks.push({ name, passed: false, detail });
    blockReasons.push(`${name}: ${detail}`);
  };
  const review = (name: string, detail: string, passed = false) => {
    checks.push({ name, passed, detail });
    needsReview = true;
  };

  // 1. Terminal state handling
  if ((txn.status === "terminal" || txn.status === "recovered") && RETRY_LIKE.has(rec.recommendedAction)) {
    block("terminal_state", `Transaction is ${txn.status}; retry-like actions are not permitted`);
  } else {
    record("terminal_state", `Transaction status ${txn.status} permits evaluation`);
  }

  // 2. Retry limits
  if (RETRY_LIKE.has(rec.recommendedAction)) {
    if (ctx.agentAttemptCount >= policy.maxAutoRetries) {
      block("retry_limit", `Agent attempts used ${ctx.agentAttemptCount}/${policy.maxAutoRetries}`);
    }
    const attemptsAfter = txn.previousAttemptCount + ctx.agentAttemptCount + 1;
    if (attemptsAfter > policy.maxAutoRetries) {
      block("retry_limit_total", `This retry would exceed total attempt cap (${attemptsAfter})`);
    }
    if (!blockReasons.some((r) => r.startsWith("retry_limit"))) {
      record("retry_limit", `${ctx.agentAttemptCount}/${policy.maxAutoRetries} auto retries used`);
    }
  }

  // 3. Minimum retry delay
  if (rec.recommendedAction === "schedule_retry") {
    const delay = ctx.proposedDelayMinutes ?? policy.minRetryDelayMinutes;
    if (delay < policy.minRetryDelayMinutes) {
      block("min_retry_delay", `Proposed ${delay}min vs minimum ${policy.minRetryDelayMinutes}min`);
    } else {
      record("min_retry_delay", `Proposed ${delay}min ≥ minimum ${policy.minRetryDelayMinutes}min`);
    }
  }

  // 4. High-value approval (review, never silent execution)
  if (txn.amount >= policy.highValueThreshold && rec.recommendedAction !== "no_action") {
    review(
      "high_value_approval",
      `₹${txn.amount.toLocaleString("en-IN")} ≥ threshold ₹${policy.highValueThreshold.toLocaleString("en-IN")} → human approval required`,
      true
    );
  }

  // 5. Duplicate prevention
  const proposedPrefix = `${txn.transactionId}:${rec.recommendedAction}`;
  const duplicate = ctx.priorIdempotencyKeys.some((k) => k.startsWith(proposedPrefix));
  if (duplicate) {
    block("idempotency", "An identical action was already executed or scheduled");
  } else {
    record("idempotency", "No prior identical action found");
  }

  // 6. Merchant allowed actions (safety actions are always permitted)
  if (!NON_CONSEQUENTIAL.has(rec.recommendedAction) && !policy.allowedActions.includes(rec.recommendedAction)) {
    block("merchant_policy", `${rec.recommendedAction} is NOT allowed by merchant policy`);
  } else {
    record("merchant_policy", `${rec.recommendedAction} permitted by merchant policy`);
  }

  // 7. Low-confidence floor (routes to review)
  if (rec.confidence < policy.lowConfidenceThreshold && rec.recommendedAction !== "no_action") {
    review(
      "confidence_floor",
      `Confidence ${(rec.confidence * 100).toFixed(0)}% below floor ${(policy.lowConfidenceThreshold * 100).toFixed(0)}% → human review`
    );
  }

  // 8. High-risk recommendations route to review
  if (rec.riskLevel === "high" && rec.recommendedAction !== "escalate_to_human") {
    review("risk_level", "High-risk recommendation routed to human review");
  }

  const decision: GuardrailResult["decision"] =
    blockReasons.length > 0 ? "BLOCK" : needsReview ? "HUMAN_REVIEW" : "ALLOW";

  return { decision, checks, reasons: blockReasons };
}
