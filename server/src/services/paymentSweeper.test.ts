import { describe, expect, it, vi } from "vitest";
import { sweepPendingPayments, type PendingRunLike, type SweeperDeps } from "./paymentSweeper.js";

function makeRun(linkId: string | null): PendingRunLike {
  return {
    runId: "run_test",
    transactionId: "TX_test",
    executedAction: linkId ? { outcome: "PENDING", paymentLinkId: linkId } : null,
  };
}

function makeDeps(overrides: Partial<SweeperDeps> = {}) {
  const finalizePaid = vi.fn(async () => ({}));
  const finalizeCancelled = vi.fn(async () => ({}));
  const deps: SweeperDeps = {
    listPendingRuns: async () => [],
    getLinkStatus: async () => "waiting",
    ...overrides,
    finalizePaid,
    finalizeCancelled,
  };
  return { deps, finalizePaid, finalizeCancelled };
}

describe("paymentSweeper", () => {
  it("finalizes paid links as recovered", async () => {
    const { deps, finalizePaid, finalizeCancelled } = makeDeps({
      listPendingRuns: async () => [makeRun("plink_paid")],
      getLinkStatus: async () => "paid",
    });
    const result = await sweepPendingPayments(deps);
    expect(result).toEqual({ checked: 1, swept: 1 });
    expect(finalizePaid).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run_test" }),
      "plink_paid"
    );
    expect(finalizeCancelled).not.toHaveBeenCalled();
  });

  it("marks cancelled links failed", async () => {
    const { deps, finalizePaid, finalizeCancelled } = makeDeps({
      listPendingRuns: async () => [makeRun("plink_dead")],
      getLinkStatus: async () => "cancelled",
    });
    const result = await sweepPendingPayments(deps);
    expect(result.swept).toBe(1);
    expect(finalizeCancelled).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_test" }));
    expect(finalizePaid).not.toHaveBeenCalled();
  });

  it("does nothing while a link is still waiting", async () => {
    const { deps, finalizePaid, finalizeCancelled } = makeDeps({
      listPendingRuns: async () => [makeRun("plink_open")],
      getLinkStatus: async () => "waiting",
    });
    const result = await sweepPendingPayments(deps);
    expect(result).toEqual({ checked: 1, swept: 0 });
    expect(finalizePaid).not.toHaveBeenCalled();
    expect(finalizeCancelled).not.toHaveBeenCalled();
  });

  it("handles mixed statuses across multiple pending runs", async () => {
    const { deps, finalizePaid, finalizeCancelled } = makeDeps({
      listPendingRuns: async () => [makeRun("plink_a"), makeRun("plink_b"), makeRun("plink_c")],
      getLinkStatus: async (id) => (id === "plink_a" ? "paid" : id === "plink_b" ? "waiting" : "cancelled"),
    });
    const result = await sweepPendingPayments(deps);
    expect(result).toEqual({ checked: 3, swept: 2 });
    expect(finalizePaid).toHaveBeenCalledTimes(1);
    expect(finalizeCancelled).toHaveBeenCalledTimes(1);
  });

  it("skips runs without a paymentLinkId defensively", async () => {
    const { deps, finalizePaid, finalizeCancelled } = makeDeps({
      listPendingRuns: async () => [makeRun(null)],
    });
    const result = await sweepPendingPayments(deps);
    expect(result.checked).toBe(1);
    expect(result.swept).toBe(0);
    expect(finalizePaid).not.toHaveBeenCalled();
  });
});
