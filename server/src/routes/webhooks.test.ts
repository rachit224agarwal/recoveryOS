import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { verifyRazorpaySignature } from "./webhooks.js";
import { env } from "../config/env.js";

const SECRET = "test_webhook_secret";
const originalSecret = env.razorpayWebhookSecret;

// Mutate the shared env object directly — ESM import hoisting means setting
// process.env before importing config/env.js is not reliable here.
beforeAll(() => {
  (env as { razorpayWebhookSecret: string }).razorpayWebhookSecret = SECRET;
});

afterAll(() => {
  (env as { razorpayWebhookSecret: string }).razorpayWebhookSecret = originalSecret;
});

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

describe("razorpay webhook signature verification", () => {
  const payload = JSON.stringify({
    event: "payment_link.paid",
    payload: { payment_link: { entity: { id: "plink_test_1" } } },
  });

  it("accepts a correctly signed request", () => {
    expect(verifyRazorpaySignature(Buffer.from(payload), sign(payload))).toBe(true);
  });

  it("rejects a forged signature", () => {
    const forged = crypto
      .createHmac("sha256", "attacker_secret")
      .update(payload)
      .digest("hex");
    expect(verifyRazorpaySignature(Buffer.from(payload), forged)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const tampered = payload.replace("paid", "cancelled");
    expect(verifyRazorpaySignature(Buffer.from(tampered), sign(payload))).toBe(false);
  });

  it("rejects when the signature header is missing", () => {
    expect(verifyRazorpaySignature(Buffer.from(payload), undefined)).toBe(false);
  });

  it("rejects everything when no webhook secret is configured", () => {
    const original = env.razorpayWebhookSecret;
    (env as { razorpayWebhookSecret: string }).razorpayWebhookSecret = "";
    try {
      expect(verifyRazorpaySignature(Buffer.from(payload), sign(payload))).toBe(false);
    } finally {
      (env as { razorpayWebhookSecret: string }).razorpayWebhookSecret = original;
    }
  });
});
