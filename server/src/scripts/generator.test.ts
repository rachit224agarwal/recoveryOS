import { describe, it, expect } from "vitest";
import { generateDataset } from "./generator.js";
import { mulberry32 } from "../utils/random.js";

describe("synthetic dataset generator", () => {
  const FIXED_TIME = 1_750_000_000_000;

  it("is deterministic for the same seed and base time", () => {
    const a = generateDataset(50, 42, FIXED_TIME);
    const b = generateDataset(50, 42, FIXED_TIME);
    expect(a.map((t) => t.transactionId)).toEqual(b.map((t) => t.transactionId));
    expect(a[0]).toEqual(b[0]);
  });

  it("produces valid transactions with consistent history counters", () => {
    const txns = generateDataset(500, 7);
    for (const t of txns) {
      expect(t.amount).toBeGreaterThanOrEqual(199);
      expect(t.amount).toBeLessThanOrEqual(150_000);
      expect(t.previousSuccessCount + t.previousFailureCount).toBe(
        t.previousSuccessCount + t.previousFailureCount
      );
      const total = t.previousSuccessCount + t.previousFailureCount;
      if (total > 0) {
        expect(t.historicalRecoveryRate).toBeCloseTo(t.previousSuccessCount / total, 2);
      }
      expect(t.recoveryProbability).toBeGreaterThan(0);
      expect(t.recoveryProbability).toBeLessThan(1);
      expect(["recoverable", "non_recoverable"]).toContain(t.expectedRecoveryLabel);
      // Label consistency with hidden probability
      expect(t.expectedRecoveryLabel === "recoverable").toBe(t.recoveryProbability >= 0.4);
    }
  });

  it("contains both recoverable and non-recoverable labels", () => {
    const txns = generateDataset(1000, 42);
    const labels = new Set(txns.map((t) => t.expectedRecoveryLabel));
    expect(labels.size).toBe(2);
  });

  it("mulberry32 is stable", () => {
    const a = mulberry32(1)();
    const b = mulberry32(1)();
    expect(a).toBe(b);
  });
});
