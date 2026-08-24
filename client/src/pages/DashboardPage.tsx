import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Bot, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader } from "@/components/domain/PageHeader";
import { MetricCard } from "@/components/domain/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/domain/status";
import { outcomeCopy, shortCategory } from "@/lib/copy";
import { formatCompactINR, formatINR, formatPct, timeAgo } from "@/lib/utils";

export function DashboardPage() {
  const { data, loading, error, refetch } = useAsync(() => api.getDashboard(), []);

  const failedCount = data?.failureCategories.reduce((s, c) => s + c.count, 0) ?? 0;
  const topPain = [...(data?.failureCategories ?? [])].sort((a, b) => b.amount - a.amount)[0];
  const lastRun = data?.recentRuns[0];

  return (
    <>
      <PageHeader
        title="Money dashboard"
        description="Every failed payment is money you already earned but haven't received. This is where it sits, and what the agent is doing about it."
      />
      <div className="space-y-5 p-6">
        {error ? <ErrorState message={error} onRetry={refetch} /> : null}

        {/* The one-sentence story */}
        {!loading && data ? (
          <div className="rounded-lg border bg-card px-5 py-4">
            <p className="text-[15px] leading-relaxed">
              <b className="num">{formatCompactINR(data.revenueAtRisk)}</b> is stuck in{" "}
              <b className="num">{failedCount.toLocaleString("en-IN")}</b> failed payments.
              The agent has already recovered{" "}
              <b className="num text-success">{formatCompactINR(data.revenueRecovered)}</b>
              {topPain ? (
                <>
                  , and the biggest leak is{" "}
                  <b>{shortCategory(topPain.category).toLowerCase()}</b> (
                  {formatCompactINR(topPain.amount)})
                </>
              ) : null}
              .
              {lastRun ? (
                <>
                  {" "}Latest move: it decided to{" "}
                  <b>{lastRun.action?.replace(/_/g, " ") ?? "take a look"}</b>{" "}
                  {timeAgo(lastRun.at)}.
                </>
              ) : null}
            </p>
          </div>
        ) : loading ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : null}

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <MetricCard
            label="Stuck money"
            value={formatCompactINR(data?.revenueAtRisk)}
            sub="Total value of payments that failed and aren't recovered yet"
            icon={<Wallet className="h-4 w-4" />}
            tone="danger"
            loading={loading}
          />
          <MetricCard
            label="Money won back"
            value={formatCompactINR(data?.revenueRecovered)}
            sub={`${formatPct(data?.recoveryRate)} of everything that failed has been recovered`}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="success"
            loading={loading}
          />
          <MetricCard
            label="Moves made by the agent"
            value={data?.automatedActions.toLocaleString("en-IN") ?? "—"}
            sub="Retries, links and nudges executed automatically in the simulator"
            icon={<Bot className="h-4 w-4" />}
            tone="info"
            loading={loading}
          />
          <MetricCard
            label="Sent to humans"
            value={
              data ? `${data.escalations.toLocaleString("en-IN")} / ${data.pendingReview}` : "—"
            }
            sub="Cases the agent refused to touch without a person's approval"
            icon={<ShieldCheck className="h-4 w-4" />}
            tone="warning"
            loading={loading}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Is the agent working? Recoveries vs failures, last 14 days</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : !data?.trend.length ? (
                <p className="py-16 text-center text-xs text-muted-foreground">No activity yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 25% 92%)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} stroke="hsl(215 15% 60%)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(215 15% 60%)" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(214 25% 90%)" }}
                      formatter={(value: number, name) => [name === "recoveredAmount" ? formatINR(value) : value, name === "recoveredAmount" ? "Recovered" : name === "failed" ? "Failed" : "Recovered count"]}
                    />
                    <Bar dataKey="failed" fill="hsl(214 30% 90%)" radius={[3, 3, 0, 0]} name="failed" />
                    <Bar dataKey="recovered" fill="hsl(142 70% 38%)" radius={[3, 3, 0, 0]} name="recovered" />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Grey bars are failures. Green bars are recoveries. You want green eating into grey.
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Where is the money stuck?</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <ul className="space-y-1">
                  {(data?.failureCategories ?? []).slice(0, 7).map((c) => {
                    const max = Math.max(...(data?.failureCategories ?? []).map((x) => x.count), 1);
                    return (
                      <li key={c.category} className="py-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="w-full shrink-0 truncate text-xs font-medium">
                            {shortCategory(c.category)}
                          </span>
                          <span className="num shrink-0 text-right text-[11px] text-muted-foreground">
                            {formatCompactINR(c.amount)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-1 items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-info/70"
                              style={{ width: `${(c.count / max) * 100}%` }}
                            />
                          </div>
                          <span className="num w-14 text-right text-[10.5px] text-muted-foreground">
                            {c.count.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Bigger bar = bigger leak. Each row says why the money is stuck.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>What the agent just did</CardTitle>
            <Link to="/agent" className="text-xs font-medium text-info hover:underline">
              See everything →
            </Link>
          </CardHeader>
          <CardContent className="pb-2">
            {loading ? (
              <div className="space-y-2 pb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-border/70 pb-2">
                {(data?.recentRuns ?? []).map((r) => {
                  const oc = outcomeCopy(r.outcome);
                  return (
                    <li key={r.runId} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        {r.outcome === "SUCCESS" ? (
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-success" />
                        ) : r.outcome === "FAILED" ? (
                          <ArrowDownRight className="h-4 w-4 shrink-0 text-danger" />
                        ) : (
                          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <p className="truncate text-[13px]">
                          Tried <b className="capitalize">{r.action?.replace(/_/g, " ") ?? "to help"}</b> on{" "}
                          <Link
                            to={`/transactions/${r.transactionId}`}
                            className="num font-medium text-info hover:underline"
                          >
                            {r.transactionId}
                          </Link>
                          {r.outcome ? <span className="text-muted-foreground"> — {oc.label.toLowerCase()}</span> : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <StatusBadge status={r.status as never} />
                        <span className="num w-20 text-right text-[11px] text-muted-foreground">{timeAgo(r.at)}</span>
                      </div>
                    </li>
                  );
                })}
                {!loading && !(data?.recentRuns ?? []).length ? (
                  <li className="py-8 text-center text-xs text-muted-foreground">
                    Nothing yet — simulate a failed payment and watch the agent react.
                  </li>
                ) : null}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
