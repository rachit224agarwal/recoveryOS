import mongoose, { Schema } from "mongoose";
import { RECOMMENDED_ACTIONS, type RecommendedAction } from "../types/domain.js";

export interface IMerchantPolicy {
  policyId: string;
  merchantId: string;
  merchantName: string;
  maxAutoRetries: number;
  minRetryDelayMinutes: number;
  /** Amounts at/above this require human approval before execution. */
  highValueThreshold: number;
  lowConfidenceThreshold: number;
  allowedActions: RecommendedAction[];
  autoEscalateAfterRetries: number;
  createdAt: Date;
}

const MerchantPolicySchema = new Schema<IMerchantPolicy>(
  {
    policyId: { type: String, required: true, unique: true },
    merchantId: { type: String, required: true, index: true },
    merchantName: { type: String, required: true },
    maxAutoRetries: { type: Number, required: true, min: 0, max: 5 },
    minRetryDelayMinutes: { type: Number, required: true, min: 0 },
    highValueThreshold: { type: Number, required: true, min: 0 },
    lowConfidenceThreshold: { type: Number, required: true, min: 0, max: 1 },
    allowedActions: [{ type: String, enum: RECOMMENDED_ACTIONS, default: RECOMMENDED_ACTIONS }],
    autoEscalateAfterRetries: { type: Number, required: true, min: 1 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false }
);

export const MerchantPolicy = mongoose.model<IMerchantPolicy>("MerchantPolicy", MerchantPolicySchema);
