import mongoose, { Schema } from "mongoose";
import type {
  EvidenceItem,
  FailureCategory,
  GuardrailResult,
  RecommendedAction,
  RecoverabilityBand,
  RecoveryRecommendation,
  RiskLevel,
  SimOutcome,
} from "../types/domain.js";

export type AgentRunStatus = "running" | "completed" | "blocked" | "awaiting_review" | "failed";

export interface IAgentEvent {
  at: Date;
  node: string;
  label: string;
  detail?: string;
}

export interface IAgentRun {
  runId: string;
  correlationId: string;
  transactionId: string;
  agentVersion: string;
  modelProvider: string;
  modelName: string;
  llmUsed: boolean;
  status: AgentRunStatus;
  events: IAgentEvent[];
  diagnosis?: FailureCategory;
  diagnosisConfidence?: number;
  recoverabilityScore?: number;
  recoverabilityBand?: RecoverabilityBand;
  recommendation?: RecoveryRecommendation;
  guardrailResult?: GuardrailResult;
  executedAction?: {
    actionType: RecommendedAction;
    idempotencyKey: string;
    attemptNumber: number;
    outcome: SimOutcome;
    failureReason?: string;
    riskLevel: RiskLevel;
    scheduledForMinutes?: number;
  };
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  latencyMs?: number;
}

const AgentRunSchema = new Schema<IAgentRun>(
  {
    runId: { type: String, required: true, unique: true },
    correlationId: { type: String, required: true, index: true },
    transactionId: { type: String, required: true, index: true },
    agentVersion: { type: String, required: true },
    modelProvider: { type: String, required: true },
    modelName: { type: String, required: true },
    llmUsed: { type: Boolean, default: false },
    status: { type: String, required: true, index: true },
    events: [
      {
        at: { type: Date, required: true },
        node: { type: String, required: true },
        label: { type: String, required: true },
        detail: { type: String },
      },
    ],
    diagnosis: { type: String },
    diagnosisConfidence: { type: Number },
    recoverabilityScore: { type: Number },
    recoverabilityBand: { type: String },
    recommendation: {
      diagnosis: String,
      confidence: Number,
      recoverability: String,
      recommendedAction: String,
      reason: String,
      evidenceIds: [String],
      riskLevel: String,
    },
    guardrailResult: {
      decision: String,
      checks: [{ name: String, passed: Boolean, detail: String }],
      reasons: [String],
    },
    executedAction: {
      actionType: { type: String },
      idempotencyKey: { type: String },
      attemptNumber: { type: Number },
      outcome: { type: String },
      failureReason: { type: String },
      riskLevel: { type: String },
      scheduledForMinutes: { type: Number },
    },
    error: { type: String },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
    latencyMs: { type: Number },
  },
  { versionKey: false }
);

export const AgentRun = mongoose.model<IAgentRun>("AgentRun", AgentRunSchema);
