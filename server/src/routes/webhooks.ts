import { Router, raw } from "express";
import crypto from "node:crypto";
import { AgentRun } from "../models/agentRun.js";
import { markRunRecovered, markRunLinkCancelled } from "../services/recoveryFinalizer.js";
import { env } from "../config/env.js";

/**
 * Razorpay webhook receiver.
 *
 * SECURITY MODEL:
 *  - Body is read RAW (mounted before express.json) because the HMAC
 *    signature is computed over the exact bytes Razorpay sent.
 *  - X-Razorpay-Signature = HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET),
 *    compared timing-safely. Forged or unsigned requests are rejected.
 *  - Only payment_link lifecycle events are honored; everything else is
 *    acknowledged and ignored.
 *
 * On payment_link.paid we finalize the story the agent started:
 *   AgentRun.executedAction PENDING → SUCCESS, transaction → recovered,
 *   audit event appended. No decision logic lives here — this endpoint can
 *   only confirm an action the guardrails already approved.
 */

export const webhooksRouter = Router();

export function verifyRazorpaySignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature || !env.razorpayWebhookSecret) return false;
  const expected = crypto
    .createHmac("sha256", env.razorpayWebhookSecret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Raw body capture — MUST be mounted before any JSON parser touches the request.
webhooksRouter.post(
  "/razorpay",
  raw({ type: "application/json", limit: "256kb" }),
  async (req, res) => {
    const signature = req.header("X-Razorpay-Signature");

    if (!verifyRazorpaySignature(req.body as Buffer, signature)) {
      res.status(400).json({ success: false, error: { code: "INVALID_SIGNATURE" } });
      return;
    }

    let event: {
      event?: string;
      payload?: {
        payment_link?: {
          entity?: {
            id?: string;
            reference_id?: string;
            notes?: Record<string, string>;
          };
        };
      };
    };
    try {
      event = JSON.parse((req.body as Buffer).toString("utf8"));
    } catch {
      res.status(400).json({ success: false, error: { code: "BAD_JSON" } });
      return;
    }

    const entity = event.payload?.payment_link?.entity;
    if (!entity?.id && !entity?.reference_id) {
      res.json({ success: true, data: { ignored: true } });
      return;
    }

    // Locate the run that created this link: prefer the runId we embedded in
    // the link notes, then fall back to the stored payment link id.
    const run = await AgentRun.findOne({
      $or: [
        ...(entity.notes?.runId ? [{ runId: entity.notes.runId }] : []),
        { "executedAction.paymentLinkId": entity.id },
      ],
      status: "completed",
    });

    if (!run?.executedAction) {
      res.json({ success: true, data: { ignored: true, reason: "no matching run" } });
      return;
    }

    const outcomeByEvent: Record<string, "SUCCESS" | "FAILED" | undefined> = {
      "payment_link.paid": "SUCCESS",
      "payment_link.cancelled": "FAILED",
      "payment_link.expired": undefined, // not terminal in our domain; leave pending
    };

    const finalOutcome = event.event ? outcomeByEvent[event.event] : undefined;

    if (event.event === "payment_link.paid") {
      await markRunRecovered(run, { paymentLinkId: entity.id, via: "webhook" });
    } else if (finalOutcome === "FAILED") {
      await markRunLinkCancelled(run);
    }

    res.json({ success: true, data: { handled: event.event ?? "unknown" } });
  }
);