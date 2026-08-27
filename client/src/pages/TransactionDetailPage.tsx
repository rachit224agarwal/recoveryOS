import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleDashed,
  FileClock,
  Play,
  XCircle,
} from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader } from "@/components/domain/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ActionIcon, GuardrailBadge, OutcomeBadge, StatusBadge } from "@/components/domain/status";
import { SectionLabel } from "@/components/domain/MetricCard";
import type { AgentEvent, TransactionStatus } from "@/types/api";
import { actionCopy, categoryCopy, codeCopy, eventTypeCopy, executorExplainer, guardrailCopy, historyLabel, methodLabel, outcomeCopy, statusCopy } from "@/lib/copy";
import { cn, formatDateTime, formatINR, formatPct } from "@/lib/utils";

interface TxnDetail {
  transactionId: string;
  merchantName: string;
  customerId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentType: string;
  failureCode: string;
  failureCategory: string;
  status: TransactionStatus;
  previousAttemptCount: number;
  previousSuccessCount: number;
  previousFailureCount: number;
  historicalRecoveryRate: number;
  recoveredAmount?: number;
  createdAt: string;
}

function EventTimeline({ events }: { events: AgentEvent[] }) {
  return (
    <ol className="relative space-y-0">
      {events.map((e, i) => (
        <motion.li
          key={`${e.at}-${i}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          className="flex gap-3 pb-4 last:pb-0"
        >
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "mt-1 h-2 w-2 rounded-full",
                e.node === "error"
                  ? "bg-danger"
                  : e.node === "execute_action" || e.node === "verify_outcome"
                    ? "bg-success"
                    : "bg-info"
              )}
            />
            {i < events.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-medium leading-tight">
                {eventTypeCopy(e.node) || e.label}
              </p>
              <span className="num shrink-0 text-[10.5px] text-muted-foreground">
                {formatDateTime(e.at).split(", ")[1] ?? ""}
              </span>
            </div>
            {e.detail ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{e.detail}</p> : null}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

export function TransactionDetailPage() {
  const { transactionId = "" } = useParams();
  const [analyzing, setAnalyzing] = useState(false);
  const { data, loading, error, refetch } = useAsync(
    () => api.getTransaction(transactionId),
    [transactionId]
  );

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      await api.analyzeTransaction(transactionId);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title={transactionId} />
        <div className="grid grid-cols-3 gap-4 p-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title={transactionId} />
        <ErrorState message={error ?? "Transaction not found."} onRetry={refetch} />
      </>
    );
  }

  const txn = data.transaction as unknown as TxnDetail;
  const latestRun = data.runs[0];
  const st = statusCopy(txn.status);
  const ac = actionCopy(latestRun?.recommendation?.recommendedAction);
  const gc = guardrailCopy(latestRun?.guardrailResult?.decision);
  const oc = outcomeCopy(latestRun?.executedAction?.outcome);

  return (
    <>
      <PageHeader
        title={`${formatINR(txn.amount)} failed payment`}
        description={`${methodLabel(txn.paymentMethod)} · ${txn.merchantName} · ${codeCopy(txn.failureCode)}. Read this page top to bottom and you'll know exactly what happened and why.`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => history.back()}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            {!["recovered", "terminal"].includes(txn.status) && latestRun ? (
              <Button size="sm" onClick={runAnalysis} disabled={analyzing}>
                <Play className="h-3.5 w-3.5" />
                {analyzing ? "Thinking…" : "Run the agent again"}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="space-y-4 p-6">
        {/* Chapter 1 — what happened */}
        <Card>
          <CardContent className="py-4">
            <p className="text-[15px] leading-relaxed">
              A customer tried to pay <b className="num">{formatINR(txn.amount)}</b> to{" "}
              <b>{txn.merchantName}</b> by <b>{methodLabel(txn.paymentMethod)}</b>. The payment{" "}
              <b className="text-danger">failed</b> — {categoryCopy(txn.failureCategory).toLowerCase()}. Right now it is:{" "}
              <StatusBadge status={txn.status} />{" "}
              <span className="text-muted-foreground">({st.blurb.toLowerCase()})</span>.
              {" "}This customer has a <b>{historyLabel(
                txn.historicalRecoveryRate > 0.7 ? "good" : txn.historicalRecoveryRate > 0.4 ? "mixed" : "poor"
              ).toLowerCase()}</b> — {txn.previousSuccessCount} of {txn.previousSuccessCount + txn.previousFailureCount} past payments succeeded.
            </p>
            {txn.recoveredAmount ? (
              <p className="mt-2 text-[15px] font-medium text-success">
                Happy ending: {formatINR(txn.recoveredAmount)} was recovered in the simulator.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Chapter 2 — the evidence */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>The evidence</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-[13px]">
                {[
                  ["Amount", formatINR(txn.amount)],
                  ["Paid by", `${methodLabel(txn.paymentMethod)} · ${txn.paymentType.replace(/_/g, " ")}`],
                  ["Failure reason", `${codeCopy(txn.failureCode)} (${txn.failureCode})`],
                  ["Customer", txn.customerId],
                  ["Track record", `${txn.previousSuccessCount}/${txn.previousSuccessCount + txn.previousFailureCount} succeeded`],
                  ["Retries already tried", String(txn.previousAttemptCount)],
                  ["Happened at", formatDateTime(txn.createdAt)],
                ].map(([k, v], i) => (
                  <div key={i} className="flex justify-between gap-4">
                    <dt className="shrink-0 capitalize text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium capitalize">{v}</dd>
                  </div>
                ))}
              </dl>

              {latestRun?.recoverabilityScore !== undefined ? (
                <div className="mt-4 border-t pt-3">
                  <SectionLabel>Can we get this money back?</SectionLabel>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="num text-xl font-semibold">
                      {Math.round(latestRun.recoverabilityScore * 100)}% likely
                    </span>
                    <Badge tone={latestRun.recoverabilityBand === "high" ? "success" : latestRun.recoverabilityBand === "medium" ? "warning" : "danger"}>
                      {latestRun.recoverabilityBand === "high"
                        ? "good odds"
                        : latestRun.recoverabilityBand === "medium"
                          ? "maybe"
                          : "long shot"}
                    </Badge>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Chapter 3 — the verdict */}
          <Card className="lg:col-span-3">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>The agent's verdict</CardTitle>
              {latestRun ? (
                <span className="num text-[11px] text-muted-foreground">
                  decided in {latestRun.latencyMs ?? "—"}ms ·{" "}
                  {latestRun.llmUsed
                    ? `AI brain (${latestRun.modelProvider}:${latestRun.modelName})`
                    : "rules brain (deterministic)"}
                </span>
              ) : null}
            </CardHeader>
            <CardContent>
              {!latestRun ? (
                <EmptyState
                  title="Nobody has looked at this yet"
                  description="Run the agent and it will read the evidence, check the rules and make a call."
                  action={
                    <Button size="sm" onClick={runAnalysis} disabled={analyzing}>
                      <Bot className="h-3.5 w-3.5" />
                      {analyzing ? "Thinking…" : "Ask the agent"}
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <SectionLabel>Decision</SectionLabel>
                    <div className="flex items-center gap-2">
                      <ActionIcon action={latestRun.recommendation!.recommendedAction} className="h-4 w-4 text-info" />
                      <span className="text-sm font-semibold">{ac.label}</span>
                      <Badge tone="outline">{formatPct(latestRun.recommendation!.confidence, 0)} sure</Badge>
                      <Badge tone={latestRun.recommendation!.riskLevel === "low" ? "neutral" : latestRun.recommendation!.riskLevel === "medium" ? "warning" : "danger"}>
                        {latestRun.recommendation!.riskLevel} risk
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{ac.blurb}</p>
                    <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed">
                      <b>Why:</b> {latestRun.recommendation!.reason}
                    </p>

                    <div className="mt-4">
                      <SectionLabel>What it looked at</SectionLabel>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {latestRun.recommendation!.evidenceIds.map((id) => (
                          <li key={id} className="flex items-start gap-1.5">
                            <FileClock className="mt-0.5 h-3 w-3 shrink-0" />
                            {id === "ev_history" &&
                              `${txn.previousSuccessCount}/${txn.previousSuccessCount + txn.previousFailureCount} past payments succeeded`}
                            {id === "ev_txn" && `The payment itself: ${codeCopy(txn.failureCode)}, ${formatINR(txn.amount)}`}
                            {id === "ev_score" && `Odds of recovery: ${formatPct(latestRun.recoverabilityScore)}`}
                            {id === "ev_policy" && `${txn.merchantName}'s rules for auto-recovery`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Safety checks</SectionLabel>
                    <div className="mb-2 flex items-center gap-2">
                      {latestRun.guardrailResult ? <GuardrailBadge decision={latestRun.guardrailResult.decision} /> : null}
                      <span className="text-xs text-muted-foreground">{gc.blurb}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {(latestRun.guardrailResult?.checks ?? []).map((c) => (
                        <li key={c.name} className="flex items-start gap-2 text-xs">
                          {c.passed ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                          ) : (
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                          )}
                          <span>
                            <span className="font-medium capitalize">{c.name.replace(/_/g, " ")}</span>
                            <span className="block text-[11px] leading-relaxed text-muted-foreground">{c.detail}</span>
                          </span>
                        </li>
                      ))}
                      {!latestRun.guardrailResult ? (
                        <li className="text-xs text-muted-foreground">No safety checks recorded.</li>
                      ) : null}
                    </ul>

                    {latestRun.executedAction ? (
                      <div className="mt-4 border-t pt-3">
                        <SectionLabel>Did it work?</SectionLabel>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <OutcomeBadge outcome={latestRun.executedAction.outcome} />
                          <span className="text-muted-foreground">{oc.blurb}</span>
                          <Badge tone={latestRun.executedAction.provider === "razorpay_test" ? "info" : "outline"}>
                            {latestRun.executedAction.provider === "razorpay_test"
                              ? "Razorpay test API"
                              : "Simulated"}
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {executorExplainer(latestRun.executedAction.provider).title}:
                          </span>{" "}
                          {executorExplainer(latestRun.executedAction.provider).body}
                        </p>
                        {latestRun.executedAction.paymentLinkUrl ? (
                          <a
                            href={latestRun.executedAction.paymentLinkUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-xs font-medium text-info hover:underline"
                          >
                            View the Razorpay payment link ↗
                          </a>
                        ) : null}
                        <p className="num mt-1 text-[11px] text-muted-foreground">
                          receipt: {latestRun.executedAction.idempotencyKey}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chapter 4 — play by play */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Play by play</CardTitle>
            <Link to="/audit" className="text-xs font-medium text-info hover:underline">
              Full audit log →
            </Link>
          </CardHeader>
          <CardContent>
            {latestRun?.events?.length ? (
              <div className="max-w-3xl pl-1">
                <EventTimeline events={[...latestRun.events].sort((a, b) => a.at.localeCompare(b.at))} />
              </div>
            ) : (
              <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
                <CircleDashed className="h-4 w-4" /> No story yet — run the agent to create one.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
