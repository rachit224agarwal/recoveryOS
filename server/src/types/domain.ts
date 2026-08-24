import { z } from "zod";

// ---------------------------------------------------------------------------
// Domain enums (single source of truth for backend + persisted documents)
// ---------------------------------------------------------------------------

export const FAILURE_CATEGORIES = [
  "temporary_failure",
  "insufficient_balance",
  "authentication_issue",
  "mandate_issue",
  "checkout_abandonment",
  "repeated_failure",
  "unknown",
] as const;
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export const PAYMENT_METHODS = ["upi", "card", "netbanking", "wallet"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_TYPES = ["one_time", "subscription", "recurring", "emi"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const TRANSACTION_STATUSES = [
  "failed",
  "analyzing",
  "in_review",
  "escalated",
  "recovered",
  "terminal",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const RECOMMENDED_ACTIONS = [
  "retry_payment",
  "schedule_retry",
  "create_payment_link",
  "send_recovery_notification",
  "escalate_to_human",
  "no_action",
] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

/** Money-touching actions — these count as "unnecessary" when evidence says non-recoverable. */
export const CONSEQUENTIAL_ACTIONS: ReadonlySet<RecommendedAction> = new Set([
  "retry_payment",
  "schedule_retry",
  "create_payment_link",
]);

export const SIM_OUTCOMES = ["SUCCESS", "FAILED", "PENDING", "BLOCKED"] as const;
export type SimOutcome = (typeof SIM_OUTCOMES)[number];

export type RecoverabilityBand = "high" | "medium" | "low" | "unknown";
export type RiskLevel = "low" | "medium" | "high";

// ---------------------------------------------------------------------------
// Failure code taxonomy (deterministic classification input)
// ---------------------------------------------------------------------------

export const FAILURE_CODES = {
  BANK_TIMEOUT: "temporary_failure",
  NETWORK_TIMEOUT: "temporary_failure",
  GATEWAY_5XX: "temporary_failure",
  ISSUER_UNAVAILABLE: "temporary_failure",

  INSUFFICIENT_FUNDS: "insufficient_balance",
  LOW_BALANCE: "insufficient_balance",

  AUTH_FAILED: "authentication_issue",
  OTP_EXPIRED: "authentication_issue",
  THREE_DS_TIMEOUT: "authentication_issue",

  MANDATE_REVOKED: "mandate_issue",
  MANDATE_EXPIRED: "mandate_issue",
  AUTOPAY_PAUSED: "mandate_issue",

  CHECKOUT_ABANDONED: "checkout_abandonment",
  USER_ABORTED: "checkout_abandonment",

  REPEATED_DECLINE: "repeated_failure",

  // Ambiguous codes require LLM interpretation
  UNKNOWN_DECLINE: "unknown",
  GATEWAY_ERROR_X1: "unknown",
} as const satisfies Record<string, FailureCategory>;

export type FailureCode = keyof typeof FAILURE_CODES;
export const ALL_FAILURE_CODES = Object.keys(FAILURE_CODES) as FailureCode[];

/**
 * Codes whose mapping is unambiguous → deterministic classification is trusted.
 * Ambiguous codes are routed to the LLM when a provider is available.
 */
export function classifyFailureCode(code: string): { category: FailureCategory; deterministic: boolean } {
  const category = FAILURE_CODES[code as FailureCode];
  if (!category) return { category: "unknown", deterministic: false };
  return { category, deterministic: category !== "unknown" };
}

// ---------------------------------------------------------------------------
// Structured agent output — the ONLY contract between LLM and policy engine
// ---------------------------------------------------------------------------

export const RecoveryRecommendationSchema = z.object({
  diagnosis: z.enum(FAILURE_CATEGORIES),
  confidence: z.number().min(0).max(1),
  recoverability: z.enum(["high", "medium", "low", "unknown"]),
  recommendedAction: z.enum(RECOMMENDED_ACTIONS),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string()),
  riskLevel: z.enum(["low", "medium", "high"]),
});
export type RecoveryRecommendation = z.infer<typeof RecoveryRecommendationSchema>;

// ---------------------------------------------------------------------------
// Evidence + guardrail contracts
// ---------------------------------------------------------------------------

export interface EvidenceItem {
  id: string;
  kind:
    | "transaction"
    | "payment_history"
    | "merchant_policy"
    | "recoverability_score"
    | "failure_signal";
  summary: string;
  data: Record<string, unknown>;
}

export type GuardrailDecision = "ALLOW" | "BLOCK" | "HUMAN_REVIEW";

export interface GuardrailCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface GuardrailResult {
  decision: GuardrailDecision;
  checks: GuardrailCheck[];
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Simulator contract
// ---------------------------------------------------------------------------

export interface SimulatedActionRequest {
  transactionId: string;
  runId: string;
  idempotencyKey: string;
  attemptNumber: number;
  actionType: RecommendedAction;
  amount: number;
  /** Hidden ground-truth recoverability probability in [0,1]; supplied by dataset, never by the LLM. */
  recoveryProbability: number;
}

export interface SimulatedActionResult {
  outcome: SimOutcome;
  failureReason?: string;
  latencyMs: number;
  amountProcessed: number;
}
