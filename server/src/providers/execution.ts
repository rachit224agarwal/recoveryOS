import { env } from "../config/env.js";
import crypto from "node:crypto";
import type {
  ExecutionProvider,
  ExecutionProviderName,
  SimulatedActionRequest,
  SimulatedActionResult,
} from "../types/domain.js";
import { simulateAction } from "../simulator/simulator.js";
import { createPaymentLink, razorpayConfigured } from "../services/razorpayClient.js";

/**
 * Razorpay caps reference_id at 40 chars — ours are longer, so we send a
 * stable short hash and carry the full key in link notes instead.
 */
export function razorpayReference(idempotencyKey: string): string {
  return crypto.createHash("sha1").update(idempotencyKey).digest("hex").slice(0, 32);
}

/**
 * Execution layer selection.
 *
 * The guardrail engine authorizes BEFORE any provider runs; providers only
 * ever receive already-approved actions.
 *
 *  - simulator     : deterministic, seeded, no external calls (default)
 *  - razorpay_test : create_payment_link hits Razorpay's REAL Payment Links
 *                    API with TEST keys — real hosted checkout + webhooks,
 *                    zero real money. All other actions stay simulated,
 *                    because genuine retries require saved mandates/tokens.
 */

const simulatorProvider: ExecutionProvider = {
  name: "simulator",
  async execute(req: SimulatedActionRequest): Promise<SimulatedActionResult> {
    return simulateAction(req);
  },
};

function toPaise(amount: number): number {
  return Math.round(amount * 100);
}

const razorpayTestProvider: ExecutionProvider = {
  name: "razorpay_test",
  async execute(req: SimulatedActionRequest): Promise<SimulatedActionResult> {
    // Only payment links are fully live in test mode.
    if (req.actionType !== "create_payment_link" || !razorpayConfigured()) {
      return simulateAction(req);
    }

    const started = Date.now();
    try {
      const link = await createPaymentLink({
        amountPaise: toPaise(req.amount),
        referenceId: razorpayReference(req.idempotencyKey),
        description: `RecoveryOS recovery for ${req.transactionId}`,
        customerName: "RecoveryOS Demo Customer",
        notes: {
          transactionId: req.transactionId,
          runId: req.runId,
          idempotencyKey: req.idempotencyKey,
        },
      });

      return {
        outcome: "PENDING", // final verdict arrives via signed webhook
        latencyMs: Date.now() - started,
        amountProcessed: 0,
        provider: "razorpay_test",
        paymentLinkUrl: link.short_url,
        paymentLinkId: link.id,
      };
    } catch (err) {
      // Provider outage must never crash the workflow — degrade to simulation.
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[razorpay_test] link creation failed, falling back to simulator: ${detail}`);
      const fallback = simulateAction(req);
      return {
        ...fallback,
        failureReason:
          fallback.failureReason === undefined
            ? `razorpay_unavailable: ${detail.slice(0, 120)}`
            : `${fallback.failureReason} (razorpay_unavailable: ${detail.slice(0, 120)})`,
      };
    }
  },
};

export function getExecutionProvider(): ExecutionProvider {
  if (env.executionProvider === "razorpay_test") return razorpayTestProvider;
  return simulatorProvider;
}

export function activeExecutorLabel(): string {
  if (env.executionProvider === "razorpay_test") {
    return razorpayConfigured()
      ? "razorpay_test (live Payment Links API)"
      : "razorpay_test (UNCONFIGURED — falling back to simulator)";
  }
  return "simulator (deterministic)";
}

export type { ExecutionProviderName };
