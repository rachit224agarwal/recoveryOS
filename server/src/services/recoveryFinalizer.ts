import { AgentRun } from "../models/agentRun.js";
import { Transaction } from "../models/transaction.js";
import { AuditEvent } from "../models/auditEvent.js";
import type { IAgentRun } from "../models/agentRun.js";

/**
 * Shared finalization logic for real Razorpay payment links.
 *
 * Used by TWO independent confirmations of the same truth:
 *  - the signed webhook (instant, production-grade), and
 *  - the API sync fallback (poll Razorpay directly — works without tunnels).
 *
 * Both are idempotent: confirming an already-confirmed payment is a no-op.
 */

export async function markRunRecovered(
  run: IAgentRun,
  opts: { paymentLinkId?: string; via: "webhook" | "api_sync" }
): Promise<{ alreadyDone: boolean }> {
  if (run.executedAction?.outcome === "SUCCESS") {
    return { alreadyDone: true };
  }

  const txn = await Transaction.findOne({ transactionId: run.transactionId });
  const linkId = opts.paymentLinkId ?? run.executedAction?.paymentLinkId ?? "unknown";

  await AgentRun.updateOne(
    { runId: run.runId },
    {
      $set: {
        "executedAction.outcome": "SUCCESS",
        "executedAction.failureReason": undefined,
      },
      $push: {
        events: {
          at: new Date(),
          node: "record_audit",
          label: `Payment confirmed via ${opts.via === "webhook" ? "webhook" : "Razorpay API sync"} — signature verified`,
          detail: `Razorpay confirmed the customer paid link ${linkId} — transaction marked recovered`,
        },
      },
    }
  );

  if (!txn) return { alreadyDone: false };

  await Transaction.updateOne(
    { transactionId: txn.transactionId },
    {
      $set: {
        status: "recovered",
        recoveredAmount: txn.amount,
        simulatedOutcome: "SUCCESS",
      },
    }
  );

  await AuditEvent.updateOne(
    { eventId: `evt_paid_${linkId}` },
    {
      $setOnInsert: {
        at: new Date(),
        actor: "system",
        type: "OUTCOME_VERIFIED",
        transactionId: txn.transactionId,
        runId: run.runId,
        correlationId: run.correlationId,
        summary: `Razorpay confirmed payment of ₹${txn.amount.toLocaleString("en-IN")} via link ${linkId} (${opts.via})`,
        data: { provider: "razorpay_test", paymentLinkId: linkId, via: opts.via },
      },
    },
    { upsert: true }
  );

  return { alreadyDone: false };
}

export async function markRunLinkCancelled(run: IAgentRun): Promise<void> {
  if (run.executedAction?.outcome !== "PENDING") return;

  await AgentRun.updateOne(
    { runId: run.runId },
    {
      $set: {
        "executedAction.outcome": "FAILED",
        "executedAction.failureReason": "payment link cancelled by customer",
      },
    }
  );
  await Transaction.updateOne(
    { transactionId: run.transactionId },
    { $set: { status: "failed", simulatedOutcome: "FAILED" }, $inc: { previousAttemptCount: 1 } }
  );
}
