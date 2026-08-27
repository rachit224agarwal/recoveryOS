import { mulberry32, hashString } from "../utils/random.js";
import type {
  RecommendedAction,
  SimulatedActionRequest,
  SimulatedActionResult,
} from "../types/domain.js";

/**
 * Deterministic payment simulator.
 *
 * NEVER moves real money. Outcomes are a pure function of the idempotency key
 * (plus the dataset's hidden recovery probability), so re-running the same
 * action always produces the same result — which makes demos reproducible and
 * duplicate execution detectable.
 *
 * Outcome distribution by recoverability band:
 *   p >= 0.75 → mostly SUCCESS
 *   0.4–0.75  → mixed
 *   < 0.4     → mostly FAILED with realistic reasons
 */

const FAILURE_REASONS = [
  "issuer_declined",
  "insufficient_funds",
  "network_timeout",
  "authentication_failed",
] as const;

function successProbability(req: SimulatedActionRequest): number {
  let p = req.recoveryProbability;
  // Notification/link actions reach fewer customers than a direct retry, but
  // cost nothing when they fail — model slightly lower conversion, not risk.
  if (req.actionType === "create_payment_link") p *= 0.92;
  if (req.actionType === "send_recovery_notification") p *= 0.8;
  if (req.actionType === "retry_payment" || req.actionType === "schedule_retry") {
    // Diminishing returns on repeated attempts.
    p *= Math.pow(0.85, Math.max(0, req.attemptNumber - 1));
  }
  return Math.min(0.97, Math.max(0.01, p));
}

export function simulateAction(req: SimulatedActionRequest): SimulatedActionResult {
  const prng = mulberry32(hashString(req.idempotencyKey));
  const rand = prng();
  const p = successProbability(req);

  const latencyMs = 400 + Math.floor(prng() * 1600);
  const outcome = rand < p ? "SUCCESS" : rand < p + 0.04 ? "PENDING" : "FAILED";

  const reasonRand = mulberry32(hashString(req.idempotencyKey + ":reason"))();

  return {
    outcome,
    failureReason:
      outcome === "FAILED"
        ? FAILURE_REASONS[Math.floor(reasonRand * FAILURE_REASONS.length)]
        : undefined,
    latencyMs,
    amountProcessed: outcome === "SUCCESS" ? req.amount : 0,
    provider: "simulator",
  };
}

/** Convenience for benchmarks: does this action touch money? */
export function isMoneyTouchingAction(action: RecommendedAction): boolean {
  return (
    action === "retry_payment" ||
    action === "schedule_retry" ||
    action === "create_payment_link"
  );
}
