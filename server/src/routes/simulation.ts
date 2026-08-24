import { Router } from "express";
import { z } from "zod";
import { Transaction } from "../models/transaction.js";
import { success, ApiError } from "../utils/api.js";
import { runRecoveryWorkflow } from "../agents/runService.js";
import { newId, idempotencyKey as mkKey } from "../utils/ids.js";
import { mulberry32, weightedPick } from "../utils/random.js";
import { ALL_FAILURE_CODES, type FailureCode, type PaymentMethod, type PaymentType } from "../types/domain.js";
import { hashString } from "../utils/random.js";

export const simulationRouter = Router();

const SimulateSchema = z.object({
  amount: z.coerce.number().min(1).max(500_000),
  paymentMethod: z.enum(["upi", "card", "netbanking", "wallet"]),
  paymentType: z.enum(["one_time", "subscription", "recurring", "emi"]),
  failureCode: z.enum(ALL_FAILURE_CODES as [FailureCode, ...FailureCode[]]),
  customerHistoryPreset: z.enum(["good", "mixed", "poor", "new"]).default("good"),
  merchantId: z.string().min(1),
});

const MERCHANTS = [
  { merchantId: "merch_demo_01", name: "Demo Store" },
  { merchantId: "merch_demo_02", name: "StreamFlix Demo" },
  { merchantId: "merch_demo_03", name: "QuickCart" },
];

/**
 * Creates a synthetic failed transaction with deterministic customer history,
 * then runs the real recovery workflow against it.
 */
simulationRouter.post("/failure", async (req, res, next) => {
  try {
    const input = SimulateSchema.parse(req.body);
    const merchant = MERCHANTS.find((m) => m.merchantId === input.merchantId) ?? MERCHANTS[0]!;
    const policyDoc = await import("../models/policy.js").then(({ MerchantPolicy }) =>
      MerchantPolicy.findOne({ merchantId: merchant.merchantId }).lean()
    );
    if (!policyDoc) throw new ApiError(500, "POLICY_MISSING", "Merchant policy not configured");

    const seed = hashString(`${Date.now()}:${input.amount}:${input.failureCode}`);
    const rand = mulberry32(seed);

    // Deterministic hidden recoverability from the requested preset
    const presetProb = { good: 0.82, mixed: 0.5, poor: 0.18, new: 0.45 }[input.customerHistoryPreset];
    const jitter = rand() * 0.16 - 0.08;
    const recoveryProbability = Math.min(0.97, Math.max(0.03, presetProb + jitter));

    const historyShape = {
      good: { total: 7, successes: 6 },
      mixed: { total: 6, successes: 3 },
      poor: { total: 8, successes: 1 },
      new: { total: 0, successes: 0 },
    }[input.customerHistoryPreset];

    const txn = await Transaction.create({
      transactionId: newId("TX"),
      merchantId: merchant.merchantId,
      merchantName: merchant.name,
      policyId: policyDoc.policyId,
      customerId: `cust_demo_${Math.floor(rand() * 9000 + 1000)}`,
      amount: Math.round(input.amount),
      currency: "INR",
      paymentMethod: input.paymentMethod satisfies PaymentMethod,
      paymentType: input.paymentType satisfies PaymentType,
      failureCode: input.failureCode,
      failureCategory: (
        await import("../types/domain.js")
      ).FAILURE_CODES[input.failureCode],
      status: "failed",
      previousAttemptCount: 0,
      previousSuccessCount: historyShape.successes,
      previousFailureCount: historyShape.total - historyShape.successes,
      historicalRecoveryRate:
        historyShape.total > 0 ? historyShape.successes / historyShape.total : 0,
      expectedRecoveryLabel: recoveryProbability >= 0.4 ? "recoverable" : "non_recoverable",
      recoveryProbability,
      createdAt: new Date(),
    });

    void mkKey; // idempotency keys are derived inside the workflow per action

    const run = await runRecoveryWorkflow(txn.transactionId);
    success(res, { transaction: txn.toObject(), run }, 201);
  } catch (err) {
    next(err);
  }
});
