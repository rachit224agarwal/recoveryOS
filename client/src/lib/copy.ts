import type { TransactionStatus } from "@/types/api";

/** Plain-English copy layer — one place that translates domain jargon into human. */

export function statusCopy(status: TransactionStatus): { label: string; blurb: string } {
  switch (status) {
    case "failed":
      return { label: "Needs attention", blurb: "Payment failed and no recovery has worked yet" };
    case "analyzing":
      return { label: "Agent looking at it", blurb: "Recovery workflow is running right now" };
    case "in_review":
      return { label: "Waiting on a human", blurb: "Policy says someone should double-check before acting" };
    case "escalated":
      return { label: "With your team", blurb: "Escalated — needs human judgment" };
    case "recovered":
      return { label: "Money back", blurb: "Recovered successfully through a simulated retry" };
    case "terminal":
      return { label: "Closed — stop trying", blurb: "Retry budget used up; automatic recovery stopped" };
    default:
      return { label: status, blurb: "" };
  }
}

export function categoryCopy(category: string): string {
  const map: Record<string, string> = {
    temporary_failure: "Bank/network hiccup — usually recovers on retry",
    insufficient_balance: "Customer didn't have enough balance",
    authentication_issue: "OTP / verification problem",
    mandate_issue: "Auto-pay permission was revoked or expired",
    checkout_abandonment: "Customer left before finishing payment",
    repeated_failure: "Failed multiple times already",
    unknown: "Unclear reason — needs smarter analysis",
  };
  return map[category] ?? category.replace(/_/g, " ");
}

export function actionCopy(action?: string): { label: string; blurb: string } {
  if (!action) return { label: "—", blurb: "" };
  const map: Record<string, { label: string; blurb: string }> = {
    retry_payment: { label: "Retry now", blurb: "Charge the customer again immediately" },
    schedule_retry: { label: "Retry later", blurb: "Wait a bit (e.g. payday), then charge again" },
    create_payment_link: { label: "Send payment link", blurb: "Let the customer pay themselves via a link" },
    send_recovery_notification: { label: "Nudge customer", blurb: "Send a gentle reminder about the failed payment" },
    escalate_to_human: { label: "Ask a human", blurb: "Too tricky for automation — route to your team" },
    no_action: { label: "Leave it", blurb: "Evidence says recovery isn't worth pursuing" },
  };
  return map[action] ?? { label: action.replace(/_/g, " "), blurb: "" };
}

export function guardrailCopy(decision?: string): { label: string; blurb: string } {
  if (!decision) return { label: "—", blurb: "" };
  if (decision === "ALLOW") return { label: "Allowed by policy", blurb: "Every safety check passed" };
  if (decision === "BLOCK") return { label: "Blocked by policy", blurb: "A hard rule said no — nothing executed" };
  return { label: "Human approval needed", blurb: "High value or low confidence — waiting for a person" };
}

export function outcomeCopy(outcome?: string): { label: string; blurb: string } {
  if (!outcome) return { label: "Not executed", blurb: "" };
  const map: Record<string, { label: string; blurb: string }> = {
    SUCCESS: { label: "Payment succeeded", blurb: "Money recovered in the simulator" },
    FAILED: { label: "Still declined", blurb: "Simulated bank refused again" },
    PENDING: { label: "Stuck in between", blurb: "Issuer hasn't confirmed yet" },
    BLOCKED: { label: "Never ran", blurb: "Stopped before touching anything" },
  };
  return map[outcome] ?? { label: outcome, blurb: "" };
}

export function eventTypeCopy(typeOrNode: string): string {
  const map: Record<string, string> = {
    run_started: "Workflow started",
    RUN_STARTED: "Workflow started",
    load_transaction: "Payment loaded",
    diagnose: "Cause identified",
    DIAGNOSIS_RECORDED: "Cause identified",
    gather_evidence: "Evidence gathered",
    EVIDENCE_RETRIEVED: "Evidence gathered",
    recommend_action: "Recommendation made",
    RECOMMENDATION_GENERATED: "Recommendation made",
    validate_guardrails: "Safety checks run",
    GUARDRAIL_DECISION: "Safety checks run",
    execute_action: "Action executed",
    ACTION_EXECUTED: "Action executed",
    verify_outcome: "Result verified",
    OUTCOME_VERIFIED: "Result verified",
    record_audit: "Written to paper trail",
    escalated: "Sent to humans",
    ESCALATED: "Sent to humans",
    blocked: "Blocked by policy",
    BLOCKED: "Blocked by policy",
    error: "Something went wrong",
    RUN_FAILED: "Workflow errored",
  };
  if (map[typeOrNode]) return map[typeOrNode];
  return map[typeOrNode.toLowerCase()] ?? typeOrNode.replace(/_/g, " ").toLowerCase();
}

/** Category name without the explanation after the dash: "Bank hiccup". */
export function shortCategory(category?: string): string {
  if (!category) return "Unknown";
  const full = categoryCopy(category);
  const dash = full.indexOf("—");
  return (dash > 0 ? full.slice(0, dash) : full).trim();
}

export function codeCopy(code: string): string {
  const map: Record<string, string> = {
    BANK_TIMEOUT: "Bank timed out",
    NETWORK_TIMEOUT: "Network timed out",
    GATEWAY_5XX: "Gateway error",
    ISSUER_UNAVAILABLE: "Card issuer unreachable",
    INSUFFICIENT_FUNDS: "Insufficient funds",
    LOW_BALANCE: "Low balance",
    AUTH_FAILED: "Authentication failed",
    OTP_EXPIRED: "OTP expired",
    THREE_DS_TIMEOUT: "3DS verification timed out",
    MANDATE_REVOKED: "Mandate revoked",
    MANDATE_EXPIRED: "Mandate expired",
    AUTOPAY_PAUSED: "Autopay paused",
    CHECKOUT_ABANDONED: "Checkout abandoned",
    USER_ABORTED: "Customer cancelled",
    REPEATED_DECLINE: "Declined repeatedly",
    UNKNOWN_DECLINE: "Unknown decline",
    GATEWAY_ERROR_X1: "Unmapped gateway error",
  };
  return map[code] ?? code;
}

export function methodLabel(method: string): string {
  const map: Record<string, string> = {
    upi: "UPI",
    card: "Card",
    netbanking: "Netbanking",
    wallet: "Wallet",
  };
  return map[method] ?? method;
}

export function historyLabel(preset?: string): string {
  const map: Record<string, string> = {
    good: "Good track record",
    mixed: "Mixed track record",
    poor: "Poor track record",
    new: "Brand-new customer",
  };
  return map[preset ?? ""] ?? preset ?? "—";
}
