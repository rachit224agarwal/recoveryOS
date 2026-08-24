import { Annotation } from "@langchain/langgraph";
import type {
  EvidenceItem,
  FailureCategory,
  GuardrailResult,
  RecoverabilityBand,
  RecoveryRecommendation,
} from "../../types/domain.js";
import type { PaymentHistorySummary } from "../../agents/tools/index.js";
import type { IMerchantPolicy } from "../../models/policy.js";
import type { ITransaction } from "../../models/transaction.js";

/**
 * Shared graph state. Every node has an explicit input/output contract:
 * nodes receive the full state and return partial updates.
 */
export const RecoveryState = Annotation.Root({
  transactionId: Annotation<string>,
  runId: Annotation<string>,
  correlationId: Annotation<string>,

  transaction: Annotation<ITransaction | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  policy: Annotation<IMerchantPolicy | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  history: Annotation<PaymentHistorySummary | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  diagnosis: Annotation<FailureCategory | "unknown" | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  diagnosisConfidence: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  needsLlm: Annotation<boolean>({
    reducer: (prev, next) => prev || next,
    default: () => false,
  }),

  evidence: Annotation<EvidenceItem[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  recoverabilityScore: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  recoverabilityBand: Annotation<RecoverabilityBand | "unknown" | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  recommendation: Annotation<RecoveryRecommendation | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  llmUsed: Annotation<boolean>({
    reducer: (prev, next) => prev || next,
    default: () => false,
  }),

  guardrailResult: Annotation<GuardrailResult | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  proposedDelayMinutes: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 45,
  }),

  executionOutcome: Annotation<
    | {
        actionType: string;
        outcome: string;
        failureReason?: string;
        idempotencyKey: string;
        attemptNumber: number;
      }
    | null
  >({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type RecoveryStateType = typeof RecoveryState.State;
