import mongoose, { Schema } from "mongoose";

export type AuditEventType =
  | "RUN_STARTED"
  | "DIAGNOSIS_RECORDED"
  | "EVIDENCE_RETRIEVED"
  | "RECOMMENDATION_GENERATED"
  | "GUARDRAIL_DECISION"
  | "ACTION_EXECUTED"
  | "OUTCOME_VERIFIED"
  | "ESCALATED"
  | "BLOCKED"
  | "RUN_FAILED";

export interface IAuditEvent {
  eventId: string;
  at: Date;
  actor: "agent" | "system" | "human";
  type: AuditEventType;
  transactionId: string;
  runId?: string;
  correlationId?: string;
  summary: string;
  data: Record<string, unknown>;
}

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    eventId: { type: String, required: true, unique: true },
    at: { type: Date, required: true, index: true },
    actor: { type: String, required: true, enum: ["agent", "system", "human"] },
    type: { type: String, required: true, index: true },
    transactionId: { type: String, required: true, index: true },
    runId: { type: String, index: true },
    correlationId: { type: String, index: true },
    summary: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { versionKey: false }
);

export const AuditEvent = mongoose.model<IAuditEvent>("AuditEvent", AuditEventSchema);
