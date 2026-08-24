import { FAILURE_CATEGORIES, RECOMMENDED_ACTIONS } from "../../types/domain.js";

/**
 * System prompt for the recovery recommendation step.
 *
 * Rules encoded here (per instructions.md §9/§27):
 * - The model recommends; it never authorizes or executes.
 * - Evidence-based only. No invented facts.
 * - Strict JSON schema output.
 * - Prefer no_action / escalate_to_human when evidence is insufficient.
 */

const SCHEMA_HINT = `{
  "diagnosis": one of ${JSON.stringify(FAILURE_CATEGORIES)},
  "confidence": number 0..1,
  "recoverability": "high" | "medium" | "low" | "unknown",
  "recommendedAction": one of ${JSON.stringify(RECOMMENDED_ACTIONS)},
  "reason": string (concise, factual, references evidence ids),
  "evidenceIds": string[] (ids of evidence you actually relied on),
  "riskLevel": "low" | "medium" | "high"
}`;

export const RECOMMENDATION_SYSTEM_PROMPT = `You are the recommendation engine inside RecoveryOS, an automated payment-recovery system for merchants.

ROLE
You analyze a failed payment event together with retrieved evidence and recommend ONE next action.

HARD CONSTRAINTS
- You NEVER authorize payments, retries beyond policy limits, or money movement. A deterministic guardrail engine reviews every recommendation and can block it.
- You MUST NOT invent transaction history, customer details, or evidence that was not provided.
- If evidence is insufficient or contradictory, prefer "no_action" or "escalate_to_human" and lower your confidence.
- Amounts are in INR.

OUTPUT
Return ONLY a single JSON object matching this schema:
${SCHEMA_HINT}

ACTION SEMANTICS
- retry_payment: immediate retry attempt now.
- schedule_retry: retry later (state the delay in your reason, e.g. "after 30 minutes").
- create_payment_link: send the customer a self-serve payment link.
- send_recovery_notification: notify the customer about the failed payment.
- escalate_to_human: needs human judgment.
- no_action: not worth pursuing.`;

export interface RecommendationPromptInput {
  transaction: {
    transactionId: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    paymentType: string;
    failureCode: string;
    preliminaryCategory: string;
    createdAt: string;
    previousAttemptCount: number;
    agentAttemptCount: number;
  };
  history: {
    totalPrevious: number;
    successful: number;
    failed: number;
    historicalRecoveryRate: number;
  };
  recoverability: { score: number; band: string; drivers: string[] };
  merchantPolicy: {
    maxAutoRetries: number;
    minRetryDelayMinutes: number;
    highValueThreshold: number;
    allowedActions: string[];
  };
  ambiguousReason?: string;
}

export function buildRecommendationUserPrompt(input: RecommendationPromptInput): string {
  return JSON.stringify(input);
}
