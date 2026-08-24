import { describe, it, expect } from "vitest";
import { evaluateGuardrails } from "./guardrailEngine.js";
import type { RecoveryRecommendation } from "../types/domain.js";
import type { ITransaction } from "../models/transaction.js";
import type { IMerchantPolicy } from "../models/policy.js";

function makeTxn(overrides: Partial<ITransaction> = {}): ITransaction {
  return {
    transactionId: "TX100001",
    merchantId: "merch_demo_01",
    merchantName: "Demo Store",
    policyId: "pol_demo_store",
    customerId: "cust_test0001",
    amount: 2499,
    currency: "INR",
    paymentMethod: "upi",
    paymentType: "subscription",
    failureCode: "BANK_TIMEOUT",
    failureCategory: "temporary_failure",
    status: "failed",
    previousAttemptCount: 0,
    previousSuccessCount: 6,
    previousFailureCount: 1,
    historicalRecoveryRate: 0.857,
    expectedRecoveryLabel: "recoverable",
    recoveryProbability: 0.8,
    createdAt: new Date(),
    ...overrides,
  };
}

const basePolicy: IMerchantPolicy = {
  policyId: "pol_demo_store",
  merchantId: "merch_demo_01",
  merchantName: "Demo Store",
  maxAutoRetries: 3,
  minRetryDelayMinutes: 15,
  highValueThreshold: 25_000,
  lowConfidenceThreshold: 0.55,
  autoEscalateAfterRetries: 3,
  allowedActions: [
    "retry_payment",
    "schedule_retry",
    "create_payment_link",
    "send_recovery_notification",
    "escalate_to_human",
    "no_action",
  ],
  createdAt: new Date(),
};

function makeRec(overrides: Partial<RecoveryRecommendation> = {}): RecoveryRecommendation {
  return {
    diagnosis: "temporary_failure",
    confidence: 0.85,
    recoverability: "high",
    recommendedAction: "retry_payment",
    reason: "test",
    evidenceIds: ["ev_txn"],
    riskLevel: "low",
    ...overrides,
  };
}

describe("guardrail engine", () => {
  it("allows a normal retry within limits", () => {
    const result = evaluateGuardrails({
      recommendation: makeRec(),
      transaction: makeTxn(),
      policy: basePolicy,
      agentAttemptCount: 0,
      priorIdempotencyKeys: [],
    });
    expect(result.decision).toBe("ALLOW");
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks retries beyond the configured maximum", () => {
    const result = evaluateGuardrails({
      recommendation: makeRec(),
      transaction: makeTxn(),
      policy: basePolicy,
      agentAttemptCount: 3,
      priorIdempotencyKeys: [],
    });
    expect(result.decision).toBe("BLOCK");
    expect(result.checks.find((c) => c.name === "retry_limit")?.passed).toBe(false);
  });

  it("requires human review above the high-value threshold", () => {
    const result = evaluateGuardrails({
      recommendation: makeRec({ riskLevel: "high" }),
      transaction: makeTxn({ amount: 40_000 }),
      policy: basePolicy,
      agentAttemptCount: 0,
      priorIdempotencyKeys: [],
    });
    expect(result.decision).toBe("HUMAN_REVIEW");
  });

  it("blocks actions not permitted by merchant policy", () => {
    const result = evaluateGuardrails({
      recommendation: makeRec({ recommendedAction: "create_payment_link" }),
      transaction: makeTxn(),
      policy: { ...basePolicy, allowedActions: ["retry_payment", "no_action"] },
      agentAttemptCount: 0,
      priorIdempotencyKeys: [],
    });
    expect(result.decision).toBe("BLOCK");
  });

  it("blocks duplicate actions via idempotency check", () => {
    const result = evaluateGuardrails({
      recommendation: makeRec(),
      transaction: makeTxn(),
      policy: basePolicy,
      agentAttemptCount: 1,
      priorIdempotencyKeys: ["TX100001:retry_payment:1"],
    });
    expect(result.decision).toBe("BLOCK");
  });

  it("routes low-confidence recommendations to human review", () => {
    const result = evaluateGuardrails({
      recommendation: makeRec({ confidence: 0.3 }),
      transaction: makeTxn(),
      policy: basePolicy,
      agentAttemptCount: 0,
      priorIdempotencyKeys: [],
    });
    expect(result.decision).toBe("HUMAN_REVIEW");
  });

  it("never allows a retry on a terminal transaction", () => {
    const result = evaluateGuardrails({
      recommendation: makeRec(),
      transaction: makeTxn({ status: "terminal" }),
      policy: basePolicy,
      agentAttemptCount: 0,
      priorIdempotencyKeys: [],
    });
    expect(result.decision).toBe("BLOCK");
  });

  it("blocks schedule_retry when below minimum delay", () => {
    const result = evaluateGuardrails({
      recommendation: makeRec({ recommendedAction: "schedule_retry" }),
      transaction: makeTxn(),
      policy: basePolicy,
      agentAttemptCount: 0,
      priorIdempotencyKeys: [],
      proposedDelayMinutes: 5,
    });
    expect(result.decision).toBe("BLOCK");
    expect(result.checks.find((c) => c.name === "min_retry_delay")?.passed).toBe(false);
  });
});
