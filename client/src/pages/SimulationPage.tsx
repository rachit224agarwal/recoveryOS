import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, ExternalLink, FlaskConical, Play, ShieldCheck, XCircle } from "lucide-react";
import { api, ApiRequestError } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader } from "@/components/domain/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { SectionLabel } from "@/components/domain/MetricCard";
import { GuardrailBadge, OutcomeBadge } from "@/components/domain/status";
import { categoryCopy, eventTypeCopy, executorExplainer } from "@/lib/copy";
import type { AgentRun } from "@/types/api";
import { formatDateTime, formatINR, formatPct } from "@/lib/utils";

const FAILURE_CODES: Array<{ code: string; label: string }> = [
  { code: "BANK_TIMEOUT", label: "Bank timed out (usually temporary)" },
  { code: "NETWORK_TIMEOUT", label: "Network timed out" },
  { code: "GATEWAY_5XX", label: "Gateway error" },
  { code: "INSUFFICIENT_FUNDS", label: "Not enough money in account" },
  { code: "LOW_BALANCE", label: "Balance too low" },
  { code: "AUTH_FAILED", label: "Verification failed (OTP/3DS)" },
  { code: "OTP_EXPIRED", label: "OTP expired" },
  { code: "MANDATE_REVOKED", label: "Customer cancelled auto-pay" },
  { code: "AUTOPAY_PAUSED", label: "Autopay paused" },
  { code: "CHECKOUT_ABANDONED", label: "Customer left checkout" },
  { code: "REPEATED_DECLINE", label: "Declined many times already" },
  { code: "UNKNOWN_DECLINE", label: "Unknown / mysterious decline" },
];

const STEPS = ["Describe the failure", "Watch the agent think", "See what happened"];

export function SimulationPage() {
  const meta = useAsync(() => api.getMeta(), []);
  const [amount, setAmount] = useState("5000");
  const [method, setMethod] = useState("upi");
  const [type, setType] = useState("subscription");
  const [code, setCode] = useState("BANK_TIMEOUT");
  const [history, setHistory] = useState("good");
  const [merchantId, setMerchantId] = useState("merch_demo_01");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ transactionId: string; run: AgentRun } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Live Razorpay link lifecycle: waiting → paid once the webhook confirms.
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "waiting" | "paid" | "timeout">("idle");
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  useEffect(() => stopPolling, []);

  const startPollingForPayment = (txnId: string) => {
    stopPolling();
    setPaymentStatus("waiting");
    const startedAt = Date.now();
    pollRef.current = window.setInterval(async () => {
      try {
        // Server asks Razorpay's API directly — works with or without webhooks.
        const res = await api.getPaymentStatus(txnId);
        if (res.paymentStatus === "paid") {
          setPaymentStatus("paid");
          stopPolling();
        } else if (res.paymentStatus === "cancelled") {
          setPaymentStatus("timeout");
          stopPolling();
        } else if (Date.now() - startedAt > 120_000) {
          setPaymentStatus("timeout");
          stopPolling();
        }
      } catch {
        /* transient — keep polling */
      }
    }, 3_000);
  };

  const simulate = async () => {
    setRunning(true);
    setError(null);
    setPaymentStatus("idle");
    try {
      const res = await api.simulateFailure({
        amount: Number(amount),
        paymentMethod: method,
        paymentType: type,
        failureCode: code,
        customerHistoryPreset: history,
        merchantId,
      });
      setResult({ transactionId: res.transaction.transactionId, run: res.run });
      if (res.run.executedAction?.paymentLinkUrl) {
        startPollingForPayment(res.transaction.transactionId);
      }
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Simulation failed — please try again."
      );
    } finally {
      setRunning(false);
    }
  };

  const run = result?.run;
  const events = [...(run?.events ?? [])].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <PageHeader
        title="Playground"
        description="Break a fake payment on purpose, then watch the agent diagnose it, check the rules, and try to recover the money — live, end to end."
      />

      {/* step strip */}
      <div className="flex flex-wrap gap-2 border-b bg-card px-6 py-3">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2 text-xs">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-info/10 font-semibold text-info">
              {i + 1}
            </span>
            <span className={run || running ? "text-muted-foreground" : "font-medium"}>
              {s}
            </span>
            {i < STEPS.length - 1 ? <span className="ml-1 text-border">→</span> : null}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Step 1 · Describe the failure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <div>
              <SectionLabel>How much money?</SectionLabel>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <SectionLabel>How did they pay?</SectionLabel>
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="netbanking">Netbanking</option>
                  <option value="wallet">Wallet</option>
                </Select>
              </div>
              <div>
                <SectionLabel>What kind of payment?</SectionLabel>
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="one_time">One time</option>
                  <option value="subscription">Subscription</option>
                  <option value="recurring">Recurring</option>
                  <option value="emi">EMI</option>
                </Select>
              </div>
            </div>
            <div>
              <SectionLabel>Why did it fail?</SectionLabel>
              <Select value={code} onChange={(e) => setCode(e.target.value)}>
                {FAILURE_CODES.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <SectionLabel>Customer's track record?</SectionLabel>
                <Select value={history} onChange={(e) => setHistory(e.target.value)}>
                  <option value="good">Pays reliably</option>
                  <option value="mixed">Sometimes fails</option>
                  <option value="poor">Often fails</option>
                  <option value="new">Brand new</option>
                </Select>
              </div>
              <div>
                <SectionLabel>Whose rules apply?</SectionLabel>
                <Select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
                  {(meta.data?.merchants ?? []).map((m) => (
                    <option key={m.merchantId} value={m.merchantId}>
                      {m.merchantName}
                    </option>
                  ))}
                  {!meta.data?.merchants.length ? <option value="merch_demo_01">Demo Store</option> : null}
                </Select>
              </div>
            </div>

            {error ? (
              <p className="rounded-md bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">{error}</p>
            ) : null}

            <Button onClick={simulate} disabled={running || !amount} className="w-full">
              <FlaskConical className="h-4 w-4" />
              {running ? "Agent is thinking…" : "Break it and watch"}
            </Button>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              This creates a real record in the database and runs the real backend workflow —
              diagnosis → evidence → recommendation → safety checks → simulator → audit.
              No real money ever moves; it's all a sandbox.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          {!run && !running ? (
            <Card className="flex h-full min-h-[320px] items-center justify-center">
              <div className="max-w-sm px-6 py-10 text-center text-muted-foreground">
                <Play className="mx-auto mb-3 h-6 w-6 opacity-40" />
                <p className="text-sm font-medium text-foreground">Steps 2 & 3 happen here</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Set up the failure on the left, hit the button, and watch the agent's
                  decision unfold as real events — every thought logged, every action justified.
                </p>
              </div>
            </Card>
          ) : null}

          {running ? (
            <Card>
              <CardContent className="py-14 text-center text-sm text-muted-foreground">
                Step 2 · The agent is reading the evidence and checking the rules…
              </CardContent>
            </Card>
          ) : null}

          {run ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Step 3 verdict */}
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Step 3 · What happened</CardTitle>
                  <Link to={`/transactions/${result!.transactionId}`} className="num text-xs font-medium text-info hover:underline">
                    Full story →
                  </Link>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Real Razorpay link branch */}
                  {run.executedAction?.paymentLinkUrl ? (
                    paymentStatus === "paid" ? (
                      <p className="text-[15px] leading-relaxed">
                        <CheckCircle2 className="mr-1.5 inline h-4 w-4 text-success" />
                        You paid the real Razorpay checkout and{" "}
                        <b>Razorpay's webhook confirmed it</b> — signature verified, money marked
                        recovered. <b className="num text-success">{formatINR(Number(amount))} back.</b>
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-[15px] leading-relaxed">
                          The agent created a <b>real Razorpay payment link</b> (test mode — no real
                          money). Open it, pay as the customer, and watch this page flip on its own
                          when Razorpay's webhook lands.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <LinkButton href={run.executedAction.paymentLinkUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Open Razorpay checkout
                          </LinkButton>
                          {paymentStatus === "waiting" ? (
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
                              Waiting for your payment… checking every 3s
                            </span>
                          ) : paymentStatus === "timeout" ? (
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                              Still waiting — the link stays valid; pay and the status will update.
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )
                  ) : run.executedAction?.outcome === "SUCCESS" ? (
                    <p className="text-[15px] leading-relaxed">
                      <CheckCircle2 className="mr-1.5 inline h-4 w-4 text-success" />
                      Good news — the agent chose{" "}
                      <b>{(run.recommendation?.recommendedAction ?? "").replace(/_/g, " ")}</b> and it worked.{" "}
                      <b className="num text-success">{formatINR(Number(amount))} recovered.</b>
                    </p>
                  ) : run.guardrailResult?.decision === "BLOCK" ? (
                    <p className="text-[15px] leading-relaxed">
                      <XCircle className="mr-1.5 inline h-4 w-4 text-danger" />
                      The agent wanted to act, but <b>safety rules said no</b>. Nothing was executed — that's the guardrails doing their job.
                    </p>
                  ) : run.status === "awaiting_review" ? (
                    <p className="text-[15px] leading-relaxed">
                      <ShieldCheck className="mr-1.5 inline h-4 w-4 text-warning" />
                      This one was too risky to automate — <b>routed to a human</b> for approval instead.
                    </p>
                  ) : (
                    <p className="text-[15px] leading-relaxed">
                      <XCircle className="mr-1.5 inline h-4 w-4 text-warning" />
                      The agent acted but the simulated bank said no again this time.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <OutcomeBadge outcome={run.executedAction?.outcome} />
                    {run.guardrailResult ? <GuardrailBadge decision={run.guardrailResult.decision} /> : null}
                    {run.executedAction?.provider ? (
                      <Badge tone={run.executedAction.provider === "razorpay_test" ? "info" : "outline"}>
                        {run.executedAction.provider === "razorpay_test"
                          ? "Executed via Razorpay test API"
                          : "Simulated execution"}
                      </Badge>
                    ) : null}
                  </div>

                  {run.executedAction ? (
                    <div className="rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      <b className="text-foreground">
                        {executorExplainer(run.executedAction.provider).title}:
                      </b>{" "}
                      {executorExplainer(run.executedAction.provider).body}
                    </div>
                  ) : null}

                  <div className="rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    <b className="text-foreground">The agent's reasoning:</b>{" "}
                    It diagnosed this as{" "}
                    <b className="capitalize text-foreground">{categoryCopy(run.diagnosis ?? "unknown").toLowerCase()}</b>,
                    estimated recovery odds at <b className="num text-foreground">{formatPct(run.recoverabilityScore)}</b>{" "}
                    ({run.recoverabilityBand}), and used its{" "}
                    <b className="text-foreground">{run.llmUsed ? "AI brain" : "deterministic rules brain"}</b> to decide. Took {run.latencyMs ?? "?"}ms.
                    {run.recommendation ? ` ${run.recommendation.reason}` : ""}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Every move, in order</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="relative max-w-xl pl-1">
                    {events.map((e, i) => (
                      <motion.li
                        key={`${e.at}-${i}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.3 }}
                        className="flex gap-3 pb-3.5 last:pb-0"
                      >
                        <div className="flex flex-col items-center">
                          <span
                            className={`mt-1 h-2 w-2 rounded-full ${
                              e.node === "validate_guardrails"
                                ? run.guardrailResult?.decision === "ALLOW"
                                  ? "bg-success"
                                  : run.guardrailResult?.decision === "BLOCK"
                                    ? "bg-danger"
                                    : "bg-warning"
                                : e.node === "execute_action" || e.node === "verify_outcome"
                                  ? "bg-success"
                                  : "bg-info"
                            }`}
                          />
                          {i < events.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-[13px] font-medium leading-tight">{eventTypeCopy(e.node)}</p>
                            <span className="num shrink-0 text-[10px] text-muted-foreground">
                              {formatDateTime(e.at).split(", ")[1] ?? ""}
                            </span>
                          </div>
                          {e.detail ? (
                            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{e.detail}</p>
                          ) : null}
                        </div>
                      </motion.li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </motion.div>
          ) : null}
        </div>
      </div>
    </>
  );
}
