import { describe, it, expect } from "vitest";
import { RecoveryRecommendationSchema } from "../../types/domain.js";

describe("structured agent output validation", () => {
  it("accepts a valid recommendation", () => {
    const parsed = RecoveryRecommendationSchema.safeParse({
      diagnosis: "temporary_failure",
      confidence: 0.87,
      recoverability: "high",
      recommendedAction: "retry_payment",
      reason: "Bank timeout with strong customer history.",
      evidenceIds: ["ev_txn", "ev_history"],
      riskLevel: "low",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown diagnosis value", () => {
    const parsed = RecoveryRecommendationSchema.safeParse({
      diagnosis: "bank_exploded",
      confidence: 0.9,
      recoverability: "high",
      recommendedAction: "retry_payment",
      reason: "test",
      evidenceIds: [],
      riskLevel: "low",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects confidence outside [0,1]", () => {
    const parsed = RecoveryRecommendationSchema.safeParse({
      diagnosis: "temporary_failure",
      confidence: 1.4,
      recoverability: "high",
      recommendedAction: "retry_payment",
      reason: "test",
      evidenceIds: [],
      riskLevel: "low",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unauthorized action type", () => {
    const parsed = RecoveryRecommendationSchema.safeParse({
      diagnosis: "temporary_failure",
      confidence: 0.9,
      recoverability: "high",
      recommendedAction: "move_money_now",
      reason: "test",
      evidenceIds: [],
      riskLevel: "low",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects missing reason", () => {
    const parsed = RecoveryRecommendationSchema.safeParse({
      diagnosis: "temporary_failure",
      confidence: 0.9,
      recoverability: "high",
      recommendedAction: "retry_payment",
      evidenceIds: [],
      riskLevel: "low",
    });
    expect(parsed.success).toBe(false);
  });
});
