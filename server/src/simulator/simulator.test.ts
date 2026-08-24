import { describe, it, expect } from "vitest";
import { simulateAction } from "./simulator.js";
import type { SimulatedActionRequest } from "../types/domain.js";

function makeReq(overrides: Partial<SimulatedActionRequest> = {}): SimulatedActionRequest {
  return {
    transactionId: "TX100002",
    runId: "run_test",
    idempotencyKey: "TX100002:retry_payment:1",
    attemptNumber: 1,
    actionType: "retry_payment",
    amount: 4999,
    recoveryProbability: 0.8,
    ...overrides,
  };
}

describe("payment simulator", () => {
  it("is deterministic for the same idempotency key", () => {
    const a = simulateAction(makeReq());
    const b = simulateAction(makeReq());
    expect(a).toEqual(b);
  });

  it("produces different outcomes across different keys", () => {
    const outcomes = new Set(
      Array.from({ length: 40 }, (_, i) =>
        simulateAction(makeReq({ idempotencyKey: `key-${i}` })).outcome
      )
    );
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("recovers most high-probability payments", () => {
    const successes = Array.from({ length: 300 }, (_, i) =>
      simulateAction(makeReq({ idempotencyKey: `hp-${i}` })).outcome === "SUCCESS"
    ).filter(Boolean).length;
    expect(successes / 300).toBeGreaterThan(0.7);
  });

  it("rarely recovers low-probability payments", () => {
    const successes = Array.from({ length: 300 }, (_, i) =>
      simulateAction(makeReq({ idempotencyKey: `lp-${i}`, recoveryProbability: 0.1 }))
        .outcome === "SUCCESS"
    ).filter(Boolean).length;
    expect(successes / 300).toBeLessThan(0.25);
  });

  it("never processes money on failure", () => {
    for (let i = 0; i < 100; i++) {
      const result = simulateAction(makeReq({ idempotencyKey: `fail-${i}`, recoveryProbability: 0.05 }));
      if (result.outcome === "FAILED") {
        expect(result.amountProcessed).toBe(0);
        expect(result.failureReason).toBeTruthy();
      }
    }
  });
});
