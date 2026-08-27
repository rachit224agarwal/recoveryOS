import { AgentRun } from "../models/agentRun.js";
import { AuditEvent } from "../models/auditEvent.js";
import type { IAgentRun } from "../models/agentRun.js";
import { recoveryGraph } from "./graph/workflow.js";
import { correlationId, newId } from "../utils/ids.js";
import { env } from "../config/env.js";
import { activeLlmLabel } from "../services/llm/llmService.js";

export async function runRecoveryWorkflow(transactionId: string): Promise<IAgentRun> {
  const runId = newId("run");
  const corr = correlationId();
  const llm = activeLlmLabel();

  const startedAt = new Date();
  await AgentRun.create({
    runId,
    correlationId: corr,
    transactionId,
    agentVersion: env.agentVersion,
    modelProvider: llm.provider,
    modelName: llm.model,
    llmUsed: false,
    status: "running",
    events: [
      {
        at: startedAt,
        node: "start",
        label: "Payment failure detected — recovery workflow started",
      },
    ],
    startedAt,
  });

  await AuditEvent.create({
    eventId: `aud_${runId}_start`,
    at: startedAt,
    actor: "system",
    type: "RUN_STARTED",
    transactionId,
    runId,
    correlationId: corr,
    summary: `Recovery workflow started (${env.agentVersion})`,
    data: {},
  });

  try {
    const result = await recoveryGraph().invoke({
      transactionId,
      runId,
      correlationId: corr,
    });

    const guardrailDecision = result.guardrailResult?.decision ?? "BLOCK";
    let status: IAgentRun["status"];
    if (
      guardrailDecision === "BLOCK" ||
      (!result.executionOutcome && result.recommendation?.recommendedAction === "no_action")
    ) {
      status = guardrailDecision === "BLOCK" ? "blocked" : "completed";
    } else if (guardrailDecision === "HUMAN_REVIEW") {
      status = "awaiting_review";
    } else if (result.recommendation?.recommendedAction === "escalate_to_human") {
      status = "awaiting_review";
    } else {
      status = "completed";
    }

    const completedAt = new Date();
    const update: Partial<IAgentRun> = {
      status,
      diagnosis: result.diagnosis ?? undefined,
      diagnosisConfidence: result.diagnosisConfidence,
      recoverabilityScore: result.recoverabilityScore,
      recoverabilityBand: result.recoverabilityBand ?? undefined,
      recommendation: result.recommendation ?? undefined,
      guardrailResult: result.guardrailResult ?? undefined,
      executedAction: result.executionOutcome
        ? {
            actionType: result.executionOutcome.actionType as NonNullable<
              IAgentRun["executedAction"]
            >["actionType"],
            idempotencyKey: result.executionOutcome.idempotencyKey,
            attemptNumber: result.executionOutcome.attemptNumber,
            outcome: result.executionOutcome.outcome as NonNullable<
              IAgentRun["executedAction"]
            >["outcome"],
            failureReason: result.executionOutcome.failureReason,
            riskLevel: result.recommendation?.riskLevel ?? "low",
            provider: result.executionOutcome.provider,
            paymentLinkId: result.executionOutcome.paymentLinkId,
            paymentLinkUrl: result.executionOutcome.paymentLinkUrl,
          }
        : undefined,
      llmUsed: result.llmUsed,
      completedAt,
      latencyMs: completedAt.getTime() - startedAt.getTime(),
    };

    await AgentRun.updateOne({ runId }, { $set: update });
    const saved = await AgentRun.findOne({ runId }).lean<IAgentRun>();
    return saved!;
  } catch (err) {
    const completedAt = new Date();
    const message = err instanceof Error ? err.message : "Unknown workflow error";
    console.error(`[agent:${runId}]`, err);
    await AgentRun.updateOne(
      { runId },
      {
        $set: {
          status: "failed",
          error: message.slice(0, 500),
          completedAt,
          latencyMs: completedAt.getTime() - startedAt.getTime(),
        },
        $push: {
          events: { at: completedAt, node: "error", label: "Workflow failed", detail: message.slice(0, 200) },
        },
      }
    );
    await AuditEvent.create({
      eventId: `aud_${runId}_err`,
      at: completedAt,
      actor: "system",
      type: "RUN_FAILED",
      transactionId,
      runId,
      correlationId: corr,
      summary: `Workflow failed: ${message.slice(0, 120)}`,
      data: {},
    });
    throw err;
  }
}
