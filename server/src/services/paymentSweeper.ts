import { AgentRun } from "../models/agentRun.js";
import { fetchPaymentLink, razorpayConfigured } from "./razorpayClient.js";
import { markRunRecovered, markRunLinkCancelled } from "./recoveryFinalizer.js";

/**
 * Payment sweeper — the always-on safety net for real Razorpay links.
 *
 * Every tick it finds runs whose payment link is still PENDING and asks
 * Razorpay's API directly whether the customer paid. This finalizes payments
 * even when webhooks aren't configured (local demos, tunnels down) or the
 * browser tab that started polling is long gone.
 *
 * All three confirmation paths (webhook, client sync endpoint, this sweeper)
 * converge on the same idempotent finalizer, so a payment can never be
 * double-counted no matter who notices first.
 */

export interface PendingRunLike {
  runId: string;
  transactionId: string;
  executedAction?: { outcome?: string; paymentLinkId?: string | null } | null;
}

export type LinkStatus = "paid" | "cancelled" | "waiting";

export interface SweeperDeps {
  listPendingRuns(): Promise<PendingRunLike[]>;
  getLinkStatus(linkId: string): Promise<LinkStatus>;
  finalizePaid(run: PendingRunLike, linkId: string): Promise<unknown>;
  finalizeCancelled(run: PendingRunLike): Promise<unknown>;
}

export const realSweeperDeps: SweeperDeps = {
  async listPendingRuns() {
    const runs = await AgentRun.find({
      "executedAction.paymentLinkId": { $exists: true, $ne: null },
      "executedAction.outcome": "PENDING",
      status: "completed",
    })
      .limit(25)
      .lean();
    return runs as unknown as PendingRunLike[];
  },
  async getLinkStatus(linkId) {
    if (!razorpayConfigured()) return "waiting";
    try {
      const link = await fetchPaymentLink(linkId);
      if (link.status === "paid") return "paid";
      if (link.status === "cancelled") return "cancelled";
      return "waiting";
    } catch (err) {
      console.error(
        `[sweeper] link check failed for ${linkId}:`,
        err instanceof Error ? err.message : err
      );
      return "waiting";
    }
  },
  finalizePaid(run, linkId) {
    return markRunRecovered(run as never, { paymentLinkId: linkId, via: "api_sync" });
  },
  finalizeCancelled(run) {
    return markRunLinkCancelled(run as never);
  },
};

export async function sweepPendingPayments(deps: SweeperDeps = realSweeperDeps) {
  const pending = await deps.listPendingRuns();
  let swept = 0;

  for (const run of pending) {
    const linkId = run.executedAction?.paymentLinkId;
    if (!linkId) continue;

    const status = await deps.getLinkStatus(linkId);
    if (status === "paid") {
      await deps.finalizePaid(run, linkId);
      console.log(`[sweeper] ${run.runId}: payment confirmed (${linkId}) — transaction recovered`);
      swept++;
    } else if (status === "cancelled") {
      await deps.finalizeCancelled(run);
      console.log(`[sweeper] ${run.runId}: payment link cancelled (${linkId}) — marked failed`);
      swept++;
    }
  }
  return { checked: pending.length, swept };
}

export function startPaymentSweeper(intervalMs = 10_000, deps: SweeperDeps = realSweeperDeps) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return; // never overlap ticks
    running = true;
    void sweepPendingPayments(deps)
      .catch((err) => console.error("[sweeper] sweep error:", err instanceof Error ? err.message : err))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref(); // don't keep the process alive just for sweeping
  console.log(`[RecoveryOS] Payment sweeper active (every ${Math.round(intervalMs / 1000)}s)`);
  return timer;
}
