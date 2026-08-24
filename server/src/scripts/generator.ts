import { mulberry32, weightedPick, hashString } from "../utils/random.js";
import {
  FAILURE_CODES,
  type FailureCode,
  type FailureCategory,
  type PaymentMethod,
  type PaymentType,
} from "../types/domain.js";

/**
 * Deterministic synthetic dataset generator.
 *
 * Ground truth model (used ONLY for evaluation, never shown to the agent):
 * each transaction gets a hidden recovery probability derived from its
 * category base rate shaped by customer history; the label is that
 * probability thresholded at 0.4.
 */

export const SEED_MERCHANTS = [
  {
    merchantId: "merch_demo_01",
    merchantName: "Demo Store",
    policyId: "pol_demo_store",
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
  },
  {
    merchantId: "merch_demo_02",
    merchantName: "StreamFlix Demo",
    policyId: "pol_streamflix",
    maxAutoRetries: 2,
    minRetryDelayMinutes: 30,
    highValueThreshold: 15_000,
    lowConfidenceThreshold: 0.6,
    autoEscalateAfterRetries: 2,
    allowedActions: [
      "retry_payment",
      "schedule_retry",
      "create_payment_link",
      "send_recovery_notification",
      "escalate_to_human",
      "no_action",
    ],
  },
  {
    merchantId: "merch_demo_03",
    merchantName: "QuickCart",
    policyId: "pol_quickcart",
    maxAutoRetries: 4,
    minRetryDelayMinutes: 10,
    highValueThreshold: 50_000,
    lowConfidenceThreshold: 0.5,
    autoEscalateAfterRetries: 3,
    allowedActions: [
      "retry_payment",
      "schedule_retry",
      "create_payment_link",
      "send_recovery_notification",
      "escalate_to_human",
      "no_action",
    ],
  },
] as const;

const FAILURE_CODE_WEIGHTS: Record<string, number> = {
  BANK_TIMEOUT: 14,
  NETWORK_TIMEOUT: 9,
  GATEWAY_5XX: 7,
  ISSUER_UNAVAILABLE: 4,
  INSUFFICIENT_FUNDS: 18,
  LOW_BALANCE: 8,
  AUTH_FAILED: 8,
  OTP_EXPIRED: 5,
  THREE_DS_TIMEOUT: 3,
  MANDATE_REVOKED: 6,
  MANDATE_EXPIRED: 4,
  AUTOPAY_PAUSED: 3,
  CHECKOUT_ABANDONED: 6,
  USER_ABORTED: 3,
  REPEATED_DECLINE: 5,
  UNKNOWN_DECLINE: 4,
  GATEWAY_ERROR_X1: 3,
};

const CATEGORY_BASE_RATE: Record<FailureCategory, number> = {
  temporary_failure: 0.58,
  insufficient_balance: 0.44,
  checkout_abandonment: 0.34,
  authentication_issue: 0.2,
  mandate_issue: 0.07,
  repeated_failure: 0.05,
  unknown: 0.14,
};

export interface GeneratedTransaction {
  transactionId: string;
  merchantId: string;
  merchantName: string;
  policyId: string;
  customerId: string;
  amount: number;
  currency: "INR";
  paymentMethod: PaymentMethod;
  paymentType: PaymentType;
  failureCode: string;
  failureCategory: FailureCategory;
  status: "failed";
  previousAttemptCount: number;
  previousSuccessCount: number;
  previousFailureCount: number;
  historicalRecoveryRate: number;
  expectedRecoveryLabel: "recoverable" | "non_recoverable";
  recoveryProbability: number;
  createdAt: Date;
}

function lognormalAmount(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  const clamped = Math.min(Math.max(z, -2.2), 2.2);
  const amount = Math.round(Math.exp(7.94 + 1.15 * clamped) / 10) * 10;
  return Math.min(Math.max(amount, 199), 150_000);
}

export function generateDataset(size: number, seed: number, baseTimeMs?: number): GeneratedTransaction[] {
  const rand = mulberry32(seed);
  const now = baseTimeMs ?? Date.now();
  const txns: GeneratedTransaction[] = [];

  for (let i = 0; i < size; i++) {
    const merchant = SEED_MERCHANTS[Math.floor(rand() * SEED_MERCHANTS.length)]!;
    const method = weightedPick<PaymentMethod>(
      { upi: 0.45, card: 0.34, netbanking: 0.13, wallet: 0.08 },
      rand()
    );
    const paymentType = weightedPick<PaymentType>(
      { one_time: 0.58, subscription: 0.26, recurring: 0.09, emi: 0.07 },
      rand()
    );
    const failureCode = weightedPick(FAILURE_CODE_WEIGHTS, rand()) as FailureCode;
    const category = FAILURE_CODES[failureCode];

    // Customer history consistent with hidden recoverability
    const totalPrev = totalPrevFor(rand);
    const base = CATEGORY_BASE_RATE[category];
    const successRatio =
      totalPrev === 0 ? 0.5 : clamp(base + gaussian(rand) * 0.22, 0, 1);
    const successes = Math.round(successRatio * totalPrev);

    let p = base;
    if (totalPrev > 0) {
      const histScore = successes / totalPrev;
      p = p * 0.65 + histScore * 0.35;
    }
    p += gaussian(rand) * 0.08;
    p = clamp(p, 0.03, 0.97);

    const createdAt = new Date(now - Math.floor(rand() * 30 * 24 * 3600 * 1000));

    txns.push({
      transactionId: `TX${String(100000 + i)}`,
      merchantId: merchant.merchantId,
      merchantName: merchant.merchantName,
      policyId: merchant.policyId,
      customerId: `cust_${String(hashString(`cust:${i}`)).slice(0, 8)}`,
      amount: lognormalAmount(rand),
      currency: "INR",
      paymentMethod: method,
      paymentType,
      failureCode,
      failureCategory: category,
      status: "failed",
      previousAttemptCount: 0,
      previousSuccessCount: successes,
      previousFailureCount: totalPrev - successes,
      historicalRecoveryRate: totalPrev > 0 ? Number((successes / totalPrev).toFixed(3)) : 0,
      expectedRecoveryLabel: p >= 0.4 ? "recoverable" : "non_recoverable",
      recoveryProbability: Number(p.toFixed(3)),
      createdAt,
    });
  }

  return txns;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function totalPrevFor(rand: () => number): number {
  const r = rand();
  if (r < 0.18) return 0; // new customers
  if (r < 0.75) return 1 + Math.floor(rand() * 5); // 1–5
  return 6 + Math.floor(rand() * 3); // 6–8
}
