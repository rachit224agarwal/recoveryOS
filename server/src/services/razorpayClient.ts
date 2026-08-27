import { env } from "../config/env.js";
import { ApiError } from "../utils/api.js";

/**
 * Minimal Razorpay REST client (Payment Links API).
 *
 * Designed for TEST MODE keys (rzp_test_…). Test mode never moves real money
 * but exercises the real hosted checkout, real link lifecycle and real webhooks.
 *
 * Auth: HTTP Basic with key id / key secret — server-side only, never exposed
 * to the browser.
 */

const RAZORPAY_API = "https://api.razorpay.com/v1";

export interface PaymentLink {
  id: string;
  short_url: string;
  status: string;
  amount: number;
  reference_id?: string;
}

export function razorpayConfigured(): boolean {
  return Boolean(env.razorpayKeyId && env.razorpayKeySecret);
}

function authHeader(): string {
  const token = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");
  return `Basic ${token}`;
}

export async function createPaymentLink(input: {  /** Amount in paise (₹1 = 100 paise). */
  amountPaise: number;
  referenceId: string;
  description: string;
  customerName: string;
  notes?: Record<string, string>;
}): Promise<PaymentLink> {
  if (!razorpayConfigured()) {
    throw new ApiError(
      500,
      "RAZORPAY_NOT_CONFIGURED",
      "EXECUTION_PROVIDER is razorpay_test but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing"
    );
  }

  const res = await fetch(`${RAZORPAY_API}/payment_links`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      accept_partial: false,
      reference_id: input.referenceId,
      description: input.description.slice(0, 200),
      customer: { name: input.customerName },
      // RecoveryOS sends the notification itself; don't double-notify.
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: input.notes ?? {},
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(
      502,
      "RAZORPAY_ERROR",
      `Razorpay API error ${res.status}: ${body.slice(0, 300)}`
    );
  }

  return (await res.json()) as PaymentLink;
}

export async function fetchPaymentLink(linkId: string): Promise<PaymentLink & { amount_paid: number }> {
  if (!razorpayConfigured()) {
    throw new ApiError(
      500,
      "RAZORPAY_NOT_CONFIGURED",
      "fetchPaymentLink called without Razorpay keys configured"
    );
  }

  const res = await fetch(`${RAZORPAY_API}/payment_links/${encodeURIComponent(linkId)}`, {
    headers: { Authorization: authHeader() },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(
      502,
      "RAZORPAY_ERROR",
      `Razorpay API error ${res.status}: ${body.slice(0, 300)}`
    );
  }

  return (await res.json()) as PaymentLink & { amount_paid: number };
}
