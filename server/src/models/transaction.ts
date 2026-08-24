import mongoose, { Schema } from "mongoose";
import {
  FAILURE_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_TYPES,
  TRANSACTION_STATUSES,
  type FailureCategory,
  type PaymentMethod,
  type PaymentType,
  type RecommendedAction,
  type TransactionStatus,
} from "../types/domain.js";

export interface ITransaction {
  transactionId: string;
  merchantId: string;
  merchantName: string;
  policyId: string;
  customerId: string; // masked/synthetic identifier
  amount: number;
  currency: "INR";
  paymentMethod: PaymentMethod;
  paymentType: PaymentType;
  failureCode: string;
  failureCategory: FailureCategory;
  status: TransactionStatus;
  previousAttemptCount: number;
  previousSuccessCount: number;
  previousFailureCount: number;
  historicalRecoveryRate: number;
  /** Ground-truth label used ONLY by offline evaluation. Never exposed to the agent. */
  expectedRecoveryLabel: "recoverable" | "non_recoverable";
  /** Ground-truth retry probability in [0,1] used by the deterministic simulator. */
  recoveryProbability: number;
  simulatedOutcome?: string;
  latestDecision?: {
    action: RecommendedAction;
    guardrail: string;
    runId: string;
    at: Date;
  };
  recoveredAmount?: number;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    transactionId: { type: String, required: true, unique: true },
    merchantId: { type: String, required: true, index: true },
    merchantName: { type: String, required: true },
    policyId: { type: String, required: true },
    customerId: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["INR"], default: "INR" },
    paymentMethod: { type: String, required: true, enum: PAYMENT_METHODS },
    paymentType: { type: String, required: true, enum: PAYMENT_TYPES },
    failureCode: { type: String, required: true, index: true },
    failureCategory: { type: String, required: true, enum: FAILURE_CATEGORIES, index: true },
    status: { type: String, required: true, enum: TRANSACTION_STATUSES, index: true },
    previousAttemptCount: { type: Number, default: 0, min: 0 },
    previousSuccessCount: { type: Number, default: 0, min: 0 },
    previousFailureCount: { type: Number, default: 0, min: 0 },
    historicalRecoveryRate: { type: Number, default: 0, min: 0, max: 1 },
    expectedRecoveryLabel: { type: String, required: true, enum: ["recoverable", "non_recoverable"] },
    recoveryProbability: { type: Number, required: true, min: 0, max: 1 },
    simulatedOutcome: { type: String },
    latestDecision: {
      action: { type: String },
      guardrail: { type: String },
      runId: { type: String },
      at: { type: Date },
    },
    recoveredAmount: { type: Number },
    createdAt: { type: Date, required: true, index: true },
  },
  { versionKey: false }
);

TransactionSchema.index({ transactionId: 1, status: 1 });
TransactionSchema.index({ merchantId: 1, createdAt: -1 });

export const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);
