import mongoose, { Schema } from "mongoose";

export interface BenchmarkMetrics {
  recoveryRate: number;
  revenueRecovered: number;
  /** Money-touching retry-like attempts made (retry_payment/schedule_retry). */
  retryAttempts: number;
  unnecessaryRetries: number;
  unnecessaryRetryRate: number;
  escalations: number;
  escalationRate: number;
  actionSuccessRate: number;
  falsePositiveActions: number;
}

export interface IEvalRun {
  evalId: string;
  seed: number;
  datasetSize: number;
  llmSpotChecks: number;
  baseline: BenchmarkMetrics;
  agent: BenchmarkMetrics;
  byCategory: Array<{
    category: string;
    baselineRecoveryRate: number;
    agentRecoveryRate: number;
    agentRevenueRecovered: number;
  }>;
  byMethod: Array<{
    method: string;
    baselineRecoveryRate: number;
    agentRecoveryRate: number;
  }>;
  createdAt: Date;
  durationMs: number;
}

const BenchmarkMetricsSchema = new Schema(
  {
    recoveryRate: { type: Number, required: true },
    revenueRecovered: { type: Number, required: true },
    retryAttempts: { type: Number, required: true },
    unnecessaryRetries: { type: Number, required: true },
    unnecessaryRetryRate: { type: Number, required: true },
    escalations: { type: Number, required: true },
    escalationRate: { type: Number, required: true },
    actionSuccessRate: { type: Number, required: true },
    falsePositiveActions: { type: Number, required: true },
  },
  { _id: false }
);

const EvalRunSchema = new Schema<IEvalRun>(
  {
    evalId: { type: String, required: true, unique: true },
    seed: { type: Number, required: true },
    datasetSize: { type: Number, required: true },
    llmSpotChecks: { type: Number, default: 0 },
    baseline: { type: BenchmarkMetricsSchema, required: true },
    agent: { type: BenchmarkMetricsSchema, required: true },
    byCategory: [
      {
        _id: false,
        category: String,
        baselineRecoveryRate: Number,
        agentRecoveryRate: Number,
        agentRevenueRecovered: Number,
      },
    ],
    byMethod: [
      {
        _id: false,
        method: String,
        baselineRecoveryRate: Number,
        agentRecoveryRate: Number,
      },
    ],
    createdAt: { type: Date, default: () => new Date(), index: true },
    durationMs: { type: Number, required: true },
  },
  { versionKey: false }
);

export const EvalRun = mongoose.model<IEvalRun>("EvalRun", EvalRunSchema);
