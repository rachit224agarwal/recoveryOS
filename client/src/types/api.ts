/** Shared API types mirroring the server's response contracts. */

export type FailureCategory =
  | "temporary_failure"
  | "insufficient_balance"
  | "authentication_issue"
  | "mandate_issue"
  | "checkout_abandonment"
  | "repeated_failure"
  | "unknown";

export type TransactionStatus =
  | "failed"
  | "analyzing"
  | "in_review"
  | "escalated"
  | "recovered"
  | "terminal";

export type RecommendedAction =
  | "retry_payment"
  | "schedule_retry"
  | "create_payment_link"
  | "send_recovery_notification"
  | "escalate_to_human"
  | "no_action";

export type PaymentMethod = "upi" | "card" | "netbanking" | "wallet";
export type PaymentType = "one_time" | "subscription" | "recurring" | "emi";

export interface TransactionListItem {
  transactionId: string;
  merchantName: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentType: PaymentType;
  failureCategory: FailureCategory;
  failureCode: string;
  status: TransactionStatus;
  latestDecision?: { action: RecommendedAction; guardrail: string; runId: string; at: string };
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface GuardrailCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface GuardrailResult {
  decision: "ALLOW" | "BLOCK" | "HUMAN_REVIEW";
  checks: GuardrailCheck[];
  reasons: string[];
}

export interface AgentEvent {
  at: string;
  node: string;
  label: string;
  detail?: string;
}

export interface AgentRun {
  runId: string;
  correlationId: string;
  transactionId: string;
  agentVersion: string;
  modelProvider: string;
  modelName: string;
  llmUsed: boolean;
  status: "running" | "completed" | "blocked" | "awaiting_review" | "failed";
  events: AgentEvent[];
  diagnosis?: FailureCategory;
  diagnosisConfidence?: number;
  recoverabilityScore?: number;
  recoverabilityBand?: "high" | "medium" | "low";
  recommendation?: {
    diagnosis: FailureCategory;
    confidence: number;
    recoverability: "high" | "medium" | "low" | "unknown";
    recommendedAction: RecommendedAction;
    reason: string;
    evidenceIds: string[];
    riskLevel: "low" | "medium" | "high";
  };
  guardrailResult?: GuardrailResult;
  executedAction?: {
    actionType: RecommendedAction;
    idempotencyKey: string;
    attemptNumber: number;
    outcome: "SUCCESS" | "FAILED" | "PENDING" | "BLOCKED";
    failureReason?: string;
    riskLevel: "low" | "medium" | "high";
  };
  error?: string;
  startedAt: string;
  completedAt?: string;
  latencyMs?: number;
}

export interface AuditItem {
  eventId: string;
  at: string;
  actor: "agent" | "system" | "human";
  type: string;
  transactionId: string;
  runId?: string;
  correlationId?: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface DashboardMetrics {
  revenueAtRisk: number;
  revenueRecovered: number;
  recoveryRate: number;
  automatedActions: number;
  escalations: number;
  pendingReview: number;
  trend: Array<{ date: string; failed: number; recovered: number; recoveredAmount: number }>;
  failureCategories: Array<{ category: string; count: number; amount: number }>;
  recentRuns: Array<{
    runId: string;
    transactionId: string;
    status: string;
    action?: string;
    outcome?: string;
    at: string;
  }>;
}

export interface BenchmarkMetrics {
  recoveryRate: number;
  revenueRecovered: number;
  retryAttempts: number;
  unnecessaryRetries: number;
  unnecessaryRetryRate: number;
  escalations: number;
  escalationRate: number;
  actionSuccessRate: number;
  falsePositiveActions: number;
}

export interface EvalRun {
  evalId: string;
  seed: number;
  datasetSize: number;
  baseline: BenchmarkMetrics;
  agent: BenchmarkMetrics;
  byCategory: Array<{ category: string; baselineRecoveryRate: number; agentRecoveryRate: number; agentRevenueRecovered: number }>;
  byMethod: Array<{ method: string; baselineRecoveryRate: number; agentRecoveryRate: number }>;
  createdAt: string;
  durationMs: number;
}

export interface MerchantInfo {
  merchantId: string;
  merchantName: string;
  policyId: string;
}

export interface AppMeta {
  appName: string;
  tagline: string;
  disclaimer: string;
  merchants: MerchantInfo[];
  transactionCount: number;
}
