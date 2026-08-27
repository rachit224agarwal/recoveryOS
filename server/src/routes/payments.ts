import { Router } from "express";
import { z } from "zod";
import { AgentRun } from "../models/agentRun.js";
import { fetchPaymentLink, razorpayConfigured } from "../services/razorpayClient.js";
import { markRunRecovered, markRunLinkCancelled } from "../services/recoveryFinalizer.js";
import { success } from "../utils/api.js";

/**
 * Payment status sync — the webhook-free confirmation path.
 *
 * The client polls this while a real Razorpay link is outstanding. It asks
 * Razorpay's API directly (server-side, test keys) whether the customer paid.
 *
 * Why both this AND webhooks exist:
 *  - Webhooks are instant but need a public URL + dashboard registration.
 *  - Sync works anywhere localhost works — perfect for local demos — at the
 *    cost of a few seconds of latency. Both paths are idempotent and converge
 *    on the same finalization logic.
 */

export const paymentsRouter = Router();

paymentsRouter.get("/status/:transactionId", async (req, res, next) => {
  try {
    const { transactionId } = z.object({ transactionId: z.string().min(3) }).parse(req.params);

    const run = await AgentRun.findOne({
      transactionId,
      "executedAction.paymentLinkId": { $exists: true, $ne: null },
      "executedAction.outcome": "PENDING",
      status: "completed",
    });

    if (!run?.executedAction?.paymentLinkId) {
      // Nothing outstanding — report current transaction state as-is.
      success(res, { paymentStatus: "none", linkId: null });
      return;
    }

    if (!razorpayConfigured()) {
      success(res, { paymentStatus: "waiting", linkId: run.executedAction.paymentLinkId });
      return;
    }

    const link = await fetchPaymentLink(run.executedAction.paymentLinkId);

    if (link.status === "paid") {
      const { alreadyDone } = await markRunRecovered(run, {
        paymentLinkId: link.id,
        via: "api_sync",
      });
      success(res, {
        paymentStatus: "paid",
        linkId: link.id,
        amountPaid: link.amount_paid ?? link.amount,
        alreadyDone,
      });
      return;
    }

    if (link.status === "cancelled") {
      await markRunLinkCancelled(run);
      success(res, { paymentStatus: "cancelled", linkId: link.id });
      return;
    }

    success(res, { paymentStatus: "waiting", linkId: link.id });
  } catch (err) {
    next(err);
  }
});
