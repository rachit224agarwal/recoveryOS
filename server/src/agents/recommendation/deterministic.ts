import type {
  FailureCategory,
  RecoveryRecommendation,
  RecoverabilityBand,
} from "../../types/domain.js";

/**
 * Deterministic recommendation logic.
 *
 * Serves two roles (both intentional, per the cost/quota skill):
 * 1. Safe fallback inside the graph when no LLM is configured or when an
 *    LLM response fails schema validation.
 * 2. The decision core used by the batch benchmark so a 10k-transaction
 *    evaluation never burns thousands of paid API calls.
 *
 * It emits the SAME zod-validated RecoveryRecommendation shape as the LLM path.
 */

interface RecommendInput {
  category: FailureCategory;
  recoverability: { score: number; band: RecoverabilityBand; drivers: string[] };
  history: { totalPrevious: number; successful: number; historicalRecoveryRate: number };
  amount: number;
  previousAttemptCount: number;
  agentAttemptCount: number;
}

const ACTION_BY_BAND_AND_CATEGORY: Record<
  RecoverabilityBand,
  Partial<Record<FailureCategory, RecoveryRecommendation["recommendedAction"]>>
> = {
  high: {
    temporary_failure: "retry_payment",
    insufficient_balance: "schedule_retry",
    checkout_abandonment: "create_payment_link",
    authentication_issue: "send_recovery_notification",
    mandate_issue: "escalate_to_human",
    repeated_failure: "no_action",
    unknown: "no_action",
  },
  medium: {
    temporary_failure: "schedule_retry",
    insufficient_balance: "create_payment_link",
    checkout_abandonment: "send_recovery_notification",
    authentication_issue: "send_recovery_notification",
    mandate_issue: "no_action",
    repeated_failure: "no_action",
    unknown: "no_action",
  },
  low: {
    temporary_failure: "no_action",
    insufficient_balance: "no_action",
    checkout_abandonment: "no_action",
    authentication_issue: "no_action",
    mandate_issue: "no_action",
    repeated_failure: "escalate_to_human",
    unknown: "escalate_to_human",
  },
  unknown: {},
};

export function recommendDeterministically(input: RecommendInput): RecoveryRecommendation {
  const { category, recoverability, history } = input;

  let action =
    ACTION_BY_BAND_AND_CATEGORY[recoverability.band][category] ?? "no_action";
  if (action === "schedule_retry") action = "schedule_retry";

  // Repeated attempts degrade confidence regardless of band.
  const attemptsUsed = input.previousAttemptCount + input.agentAttemptCount;
  if (attemptsUsed >= 2) action = "no_action";
  if (attemptsUsed >= 3) action = "escalate_to_human";

  const evidenceIds = ["ev_txn", "ev_history", "ev_policy", "ev_score"];

  const reasonBits: string[] = [];
  reasonBits.push(`Classified as ${category.replace(/_/g, " ")}`);
  if (history.totalPrevious > 0) {
    reasonBits.push(
      `${history.successful}/${history.totalPrevious} prior payments succeeded`
    );
  }
  reasonBits.push(`recoverability ${Math.round(recoverability.score * 100)}% (${recoverability.band})`);

  const delayHint =
    action === "schedule_retry"
      ? " after 45 minutes to allow balance refresh"
      : "";
  reasonBits.push(`→ ${action.replace(/_/g, " ")}${delayHint}`);

  const confidence =
    category === "unknown"
      ? 0.35
      : recoverability.band === "high"
        ? Math.min(0.92, 0.62 + recoverability.score * 0.3)
        : recoverability.band === "medium"
          ? 0.5 + recoverability.score * 0.2
          : 0.4 + recoverability.score * 0.15;

  return {
    diagnosis: category,
    confidence: Number(confidence.toFixed(2)),
    recoverability: recoverability.band,
    recommendedAction: action,
    reason: reasonBits.join("; "),
    evidenceIds,
    riskLevel:
      input.amount >= 50_000 ? "high" : input.amount >= 10_000 ? "medium" : "low",
  };
}
