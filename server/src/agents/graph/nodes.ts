import type { RecoveryStateType } from "./state.js";
import { Transaction } from "../../models/transaction.js";
import { AgentRun } from "../../models/agentRun.js";
import { AuditEvent } from "../../models/auditEvent.js";
import {
  getMerchantPolicy,
  getPaymentHistory,
  calculateRecoverability,
} from "../../agents/tools/index.js";
import { classifyFailureCode } from "../../types/domain.js";
import { evaluateGuardrails } from "../../guardrails/guardrailEngine.js";
import { recommendDeterministically } from "../recommendation/deterministic.js";
import { generateRecommendation, llmConfigured } from "../../services/llm/llmService.js";
import {
  RECOMMENDATION_SYSTEM_PROMPT,
  buildRecommendationUserPrompt,
} from "../../services/llm/prompts.js";
import { env } from "../../config/env.js";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function emit(
  runId: string,
  node: string,
  label: string,
  detail?: string
): Promise<void> {
  await AgentRun.updateOne(
    { runId },
    { $push: { events: { at: new Date(), node, label, detail } } }
  );
}

function pick<T extends string>(detail?: T): string | undefined {
  return detail;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export async function loadTransaction(state: RecoveryStateType): Promise<Partial<RecoveryStateType>> {
  const txn = await Transaction.findOne({ transactionId: state.transactionId }).lean();
  if (!txn) throw new Error(`Transaction ${state.transactionId} not found`);
  const policy = await getMerchantPolicy(txn.merchantId);
  const history = await getPaymentHistory(txn);
  return { transaction: txn, policy, history };
}

export async function diagnoseFailure(state: RecoveryStateType): Promise<Partial<RecoveryStateType>> {
  const txn = state.transaction!;
  const { category, deterministic } = classifyFailureCode(txn.failureCode);
  const confidence = deterministic ? 0.9 : 0.4;

  await emit(
    state.runId,
    "diagnose_failure",
    `Failure classified: ${category}`,
    deterministic
      ? `Deterministic mapping of code ${txn.failureCode}`
      : `Ambiguous code ${txn.failureCode} — LLM interpretation requested`
  );

  return {
    diagnosis: category,
    diagnosisConfidence: confidence,
    needsLlm: !deterministic,
  };
}

export async function retrieveEvidence(state: RecoveryStateType): Promise<Partial<RecoveryStateType>> {
  const txn = state.transaction!;
  const history = state.history!;

  const evidence = [
    {
      id: "ev_txn",
      kind: "transaction" as const,
      summary: `${txn.paymentMethod.toUpperCase()} ${txn.paymentType} · ₹${txn.amount.toLocaleString("en-IN")} · code ${txn.failureCode}`,
      data: {
        failureCode: txn.failureCode,
        amount: txn.amount,
        paymentMethod: txn.paymentMethod,
        paymentType: txn.paymentType,
        previousAttemptCount: txn.previousAttemptCount,
      },
    },
    {
      id: "ev_history",
      kind: "payment_history" as const,
      summary:
        history.totalPrevious > 0
          ? `${history.successful}/${history.totalPrevious} previous payments succeeded (${Math.round(history.historicalRecoveryRate * 100)}% recovery)`
          : "No previous payments for this customer",
      data: { ...history },
    },
  ];

  await emit(
    state.runId,
    "retrieve_evidence",
    "Evidence retrieved",
    evidence.map((e) => e.summary).join(" · ")
  );

  return { evidence };
}

export async function estimateRecoverability(state: RecoveryStateType): Promise<Partial<RecoveryStateType>> {
  const estimate = calculateRecoverability(state.transaction!, state.history!);

  const evidenceItem = {
    id: "ev_score",
    kind: "recoverability_score" as const,
    summary: `Recovery probability ${Math.round(estimate.score * 100)}% (${estimate.band})`,
    data: { ...estimate },
  };

  await emit(
    state.runId,
    "estimate_recoverability",
    `Recovery probability calculated: ${Math.round(estimate.score * 100)}%`,
    estimate.drivers.join("; ")
  );

  return {
    recoverabilityScore: estimate.score,
    recoverabilityBand: estimate.band,
    evidence: [evidenceItem],
  };
}

export async function recommendAction(state: RecoveryStateType): Promise<Partial<RecoveryStateType>> {
  const txn = state.transaction!;
  const history = state.history!;

  const promptInput = {
    transaction: {
      transactionId: txn.transactionId,
      amount: txn.amount,
      currency: txn.currency,
      paymentMethod: txn.paymentMethod,
      paymentType: txn.paymentType,
      failureCode: txn.failureCode,
      preliminaryCategory: state.diagnosis ?? "unknown",
      createdAt: txn.createdAt.toISOString(),
      previousAttemptCount: txn.previousAttemptCount,
      agentAttemptCount: txn.previousAttemptCount,
    },
    history: {
      totalPrevious: history.totalPrevious,
      successful: history.successful,
      failed: history.failed,
      historicalRecoveryRate: history.historicalRecoveryRate,
    },
    recoverability: {
      score: state.recoverabilityScore,
      band: state.recoverabilityBand ?? "unknown",
      drivers: [],
    },
    merchantPolicy: {
      maxAutoRetries: state.policy!.maxAutoRetries,
      minRetryDelayMinutes: state.policy!.minRetryDelayMinutes,
      highValueThreshold: state.policy!.highValueThreshold,
      allowedActions: state.policy!.allowedActions,
    },
    ambiguousReason: pick<string>(),
  };

  let recommendation;
  let llmUsed = false;

  if (state.needsLlm && llmConfigured()) {
    try {
      const result = await generateRecommendation(
        RECOMMENDATION_SYSTEM_PROMPT,
        buildRecommendationUserPrompt(promptInput)
      );
      recommendation = result.data;
      llmUsed = true;
      await emit(
        state.runId,
        "recommend_action",
        `Recommendation generated (${result.meta.provider}:${result.meta.model})`,
        `${result.data.recommendedAction} · confidence ${(result.data.confidence * 100).toFixed(0)}%`
      );
    } catch (err) {
      // Schema/network/quota failures must NEVER execute anything unsafe.
      await emit(
        state.runId,
        "recommend_action",
        "LLM output rejected — falling back to deterministic rules",
        err instanceof Error ? err.message.slice(0, 200) : "unknown LLM error"
      );
    }
  }

  if (!recommendation) {
    recommendation = recommendDeterministically({
      category: state.diagnosis ?? "unknown",
      recoverability: {
        score: state.recoverabilityScore,
        band: state.recoverabilityBand ?? "low",
        drivers: [],
      },
      history: {
        totalPrevious: history.totalPrevious,
        successful: history.successful,
        historicalRecoveryRate: history.historicalRecoveryRate,
      },
      amount: txn.amount,
      previousAttemptCount: txn.previousAttemptCount,
      agentAttemptCount: 0,
    });
    if (!llmUsed) {
      await emit(
        state.runId,
        "recommend_action",
        "Recommendation generated (deterministic rules)",
        `${recommendation.recommendedAction} · confidence ${(recommendation.confidence * 100).toFixed(0)}%`
      );
    }
  }

  // Extract proposed delay for schedule_retry from the reason text is fragile;
  // deterministic path uses fixed 45min, LLM path defaults to policy minimum.
  const proposedDelayMinutes = Math.max(state.policy!.minRetryDelayMinutes, 45);

  return { recommendation, llmUsed, proposedDelayMinutes };
}

export async function validateGuardrailsNode(state: RecoveryStateType): Promise<Partial<RecoveryStateType>> {
  const rec = state.recommendation!;
  const txn = state.transaction!;
  const policy = state.policy!;

  const priorRuns = await AgentRun.find(
    { transactionId: txn.transactionId, "executedAction.idempotencyKey": { $exists: true } },
    { "executedAction.idempotencyKey": 1, "executedAction.attemptNumber": 1 }
  ).lean();

  const result = evaluateGuardrails({
    recommendation: rec,
    transaction: txn,
    policy,
    agentAttemptCount: priorRuns.length,
    priorIdempotencyKeys: priorRuns.map((r) => r.executedAction?.idempotencyKey ?? ""),
    proposedDelayMinutes: rec.recommendedAction === "schedule_retry" ? state.proposedDelayMinutes : undefined,
  });

  await emit(
    state.runId,
    "validate_guardrails",
    `Guardrail: ${result.decision.replace("_", " ")}`,
    result.reasons.length ? result.reasons.join("; ") : `${result.checks.filter((c) => c.passed).length}/${result.checks.length} checks passed`
  );

  return { guardrailResult: result };
}

export async function executeAction(state: RecoveryStateType): Promise<Partial<RecoveryStateType>> {
  const rec = state.recommendation!;
  const txn = state.transaction!;
  void env; // provider config referenced indirectly via llmService

  const attemptNumber = 1; // within-run attempt; cross-run counted by guardrails

  if (
    rec.recommendedAction === "no_action" ||
    rec.recommendedAction === "escalate_to_human"
  ) {
    return {
      executionOutcome: null,
    };
  }

  const { executeSimulatedAction } = await import("../../agents/tools/index.js");
  const { result, idempotencyKey } = await executeSimulatedAction({
    transactionId: txn.transactionId,
    runId: state.runId,
    actionType: rec.recommendedAction,
    attemptNumber,
    recoveryProbability: txn.recoveryProbability,
  });

  await emit(
    state.runId,
    "execute_action",
    result.paymentLinkUrl
      ? `${rec.recommendedAction.replace(/_/g, " ")} executed → Razorpay payment link created (awaiting customer payment)`
      : `${rec.recommendedAction.replace(/_/g, " ")} executed → ${result.outcome}`,
    result.paymentLinkUrl
      ? `live link ${result.paymentLinkId} via Razorpay test API — webhook will confirm the outcome`
      : result.failureReason
        ? `failure reason: ${result.failureReason}`
        : `₹${result.amountProcessed.toLocaleString("en-IN")} processed (${result.provider})`
  );

  return {
    executionOutcome: {
      actionType: rec.recommendedAction,
      outcome: result.outcome,
      failureReason: result.failureReason,
      idempotencyKey,
      attemptNumber,
      provider: result.provider,
      paymentLinkId: result.paymentLinkId,
      paymentLinkUrl: result.paymentLinkUrl,
    },
  };
}

export async function verifyOutcome(state: RecoveryStateType): Promise<Partial<RecoveryStateType>> {
  const rec = state.recommendation!;
  const txn = state.transaction!;
  const gr = state.guardrailResult!;
  const exec = state.executionOutcome;

  const now = new Date();
  const decisionSnapshot = {
    action: rec.recommendedAction,
    guardrail: gr.decision,
    runId: state.runId,
    at: now,
  };

  if (gr.decision === "HUMAN_REVIEW" || rec.recommendedAction === "escalate_to_human") {
    await Transaction.updateOne(
      { transactionId: txn.transactionId },
      { $set: { status: "escalated", latestDecision: decisionSnapshot } }
    );
    await emit(state.runId, "verify_outcome", "Escalated to human review", rec.reason);
    return {};
  }

  if (!exec) {
    await Transaction.updateOne(
      { transactionId: txn.transactionId },
      { $set: { latestDecision: decisionSnapshot } }
    );
    await emit(state.runId, "verify_outcome", "No action taken", rec.reason);
    return {};
  }

  if (exec.outcome === "SUCCESS") {
    await Transaction.updateOne(
      { transactionId: txn.transactionId },
      {
        $set: {
          status: "recovered",
          recoveredAmount: txn.amount,
          latestDecision: decisionSnapshot,
          simulatedOutcome: "SUCCESS",
        },
      }
    );
    await emit(
      state.runId,
      "verify_outcome",
      `Payment recovered · ₹${txn.amount.toLocaleString("en-IN")}`,
      "Simulated settlement confirmed"
    );
  } else if (exec.outcome === "PENDING" && exec.paymentLinkUrl) {
    // Real Razorpay link is live — the signed webhook completes this story.
    await Transaction.updateOne(
      { transactionId: txn.transactionId },
      {
        $set: {
          status: "in_review",
          latestDecision: decisionSnapshot,
          simulatedOutcome: "PENDING",
        },
      }
    );
    await emit(
      state.runId,
      "verify_outcome",
      "Razorpay payment link sent — waiting for the customer to pay",
      `monitoring ${exec.paymentLinkId}; a verified webhook will finalize recovery`
    );
  } else if (exec.outcome === "PENDING") {
    await Transaction.updateOne(
      { transactionId: txn.transactionId },
      {
        $set: {
          status: "in_review",
          latestDecision: decisionSnapshot,
          simulatedOutcome: "PENDING",
        },
      }
    );
    await emit(state.runId, "verify_outcome", "Payment pending at issuer", "Marked for monitoring");
  } else {
    const exhausted = txn.previousAttemptCount >= state.policy!.autoEscalateAfterRetries;
    await Transaction.updateOne(
      { transactionId: txn.transactionId },
      {
        $set: {
          status: exhausted ? "terminal" : "failed",
          simulatedOutcome: "FAILED",
          latestDecision: decisionSnapshot,
        },
        $inc: { previousAttemptCount: 1, previousFailureCount: 1 },
      }
    );
    await emit(
      state.runId,
      "verify_outcome",
      exhausted ? "Retry budget exhausted → terminal" : `Retry failed (${exec.failureReason ?? "unknown"})`,
      exhausted ? "No further automatic attempts permitted" : undefined
    );
  }

  return {};
}

export async function recordAudit(state: RecoveryStateType): Promise<Partial<RecoveryStateType>> {
  const rec = state.recommendation!;
  const gr = state.guardrailResult!;
  const exec = state.executionOutcome;

  const base = {
    transactionId: state.transactionId,
    runId: state.runId,
    correlationId: state.correlationId,
  };

  const docs: Array<{
    transactionId: string;
    runId: string;
    correlationId: string;
    eventId: string;
    at: Date;
    actor: "agent" | "system" | "human";
    type: string;
    summary: string;
    data: Record<string, unknown>;
  }> = [
    {
      ...base,
      eventId: `aud_${state.runId}_rec`,
      at: new Date(),
      actor: "agent" as const,
      type: "RECOMMENDATION_GENERATED" as const,
      summary: `${rec.recommendedAction} recommended (confidence ${(rec.confidence * 100).toFixed(0)}%)`,
      data: {
        diagnosis: rec.diagnosis,
        recoverability: rec.recoverability,
        reason: rec.reason,
        evidenceIds: rec.evidenceIds,
        riskLevel: rec.riskLevel,
        modelProvider: env.llmProvider,
        modelName: env.llmModel || "-",
      },
    },
    {
      ...base,
      eventId: `aud_${state.runId}_grd`,
      at: new Date(),
      actor: "system" as const,
      type: "GUARDRAIL_DECISION" as const,
      summary: `Policy engine verdict: ${gr.decision}`,
      data: { checks: gr.checks, reasons: gr.reasons },
    },
  ];

  if (gr.decision === "BLOCK") {
    docs.push({
      ...base,
      eventId: `aud_${state.runId}_blk`,
      at: new Date(),
      actor: "system" as const,
      type: "BLOCKED" as const,
      summary: `Action blocked: ${gr.reasons.join("; ")}`,
      data: { blocked: true },
    });
  }

  if (exec) {
    docs.push({
      ...base,
      eventId: `aud_${state.runId}_act`,
      at: new Date(),
      actor: "agent" as const,
      type: "ACTION_EXECUTED" as const,
      summary: `${exec.actionType} → ${exec.outcome}`,
      data: { ...exec, simulated: true },
    });
    docs.push({
      ...base,
      eventId: `aud_${state.runId}_vrf`,
      at: new Date(),
      actor: "system" as const,
      type: "OUTCOME_VERIFIED" as const,
      summary:
        exec.outcome === "SUCCESS"
          ? "Recovered revenue verified against simulator ledger"
          : `Outcome ${exec.outcome} verified`,
      data: { outcome: exec.outcome },
    });
  }

  await AuditEvent.insertMany(docs);
  return {};
}
