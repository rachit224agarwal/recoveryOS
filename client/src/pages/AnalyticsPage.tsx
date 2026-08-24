import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Play, RefreshCw } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { useState } from "react";
import { PageHeader } from "@/components/domain/PageHeader";
import { MetricCard, SectionLabel } from "@/components/domain/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import type { EvalRun } from "@/types/api";
import { shortCategory } from "@/lib/copy";
import { formatCompactINR, formatPct } from "@/lib/utils";

const CHART_COLORS = {
  baseline: "hsl(214 25% 78%)",
  agent: "hsl(217 91% 52%)",
};

function CompareChart({
  data,
  name,
  formatter,
}: {
  data: Array<{ label: string; baseline: number; agent: number }>;
  name: string;
  formatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 25% 92%)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(215 15% 60%)" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(215 15% 60%)" />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value: number) => (formatter ? formatter(value) : value)}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="baseline" fill={CHART_COLORS.baseline} radius={[3, 3, 0, 0]} name={`Baseline ${name}`} />
        <Bar dataKey="agent" fill={CHART_COLORS.agent} radius={[3, 3, 0, 0]} name={`RecoveryOS ${name}`} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AnalyticsPage() {
  const [running, setRunning] = useState(false);
  const benchmark = useAsync(() => api.getBenchmark(), []);

  const runBenchmarkNow = async () => {
    setRunning(true);
    try {
      await api.runBenchmark(10_000);
      benchmark.refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Benchmark failed");
    } finally {
      setRunning(false);
    }
  };

  if (benchmark.loading) {
    return (
      <>
        <PageHeader title="Analytics" />
        <div className="grid grid-cols-2 gap-4 p-6 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </>
    );
  }

  if (benchmark.error) {
    return (
      <>
        <PageHeader title="Analytics" />
        <ErrorState message={benchmark.error} onRetry={benchmark.refetch} />
      </>
    );
  }

  if (!benchmark.data) {
    return (
      <>
        <PageHeader title="Analytics" />
        <EmptyState
          title="No benchmark results yet"
          description="Run the baseline-vs-agent evaluation over the synthetic dataset."
          action={
            <Button size="sm" onClick={runBenchmarkNow} disabled={running}>
              <Play className="h-3.5 w-3.5" /> {running ? "Evaluating…" : "Run benchmark"}
            </Button>
          }
        />
      </>
    );
  }

  const e: EvalRun = benchmark.data;

  const summaryRows: Array<[string, string, string]> = [
    [
      "Recovery rate",
      formatPct(e.baseline.recoveryRate),
      formatPct(e.agent.recoveryRate),
    ],
    [
      "Revenue recovered",
      formatCompactINR(e.baseline.revenueRecovered),
      formatCompactINR(e.agent.revenueRecovered),
    ],
    [
      "Retry attempts",
      e.baseline.retryAttempts.toLocaleString("en-IN"),
      e.agent.retryAttempts.toLocaleString("en-IN"),
    ],
    [
      "Unnecessary retries",
      formatPct(e.baseline.unnecessaryRetryRate),
      formatPct(e.agent.unnecessaryRetryRate),
    ],
    [
      "Action success rate",
      formatPct(e.baseline.actionSuccessRate),
      formatPct(e.agent.actionSuccessRate),
    ],
    [
      "Escalations",
      `${e.baseline.escalations.toLocaleString("en-IN")} (${formatPct(e.baseline.escalationRate, 1)})`,
      `${e.agent.escalations.toLocaleString("en-IN")} (${formatPct(e.agent.escalationRate, 1)})`,
    ],
  ];

  const uplift =
    e.agent.revenueRecovered > 0 && e.baseline.revenueRecovered > 0
      ? (e.agent.revenueRecovered - e.baseline.revenueRecovered) / e.baseline.revenueRecovered
      : 0;
  const retryReduction =
    e.baseline.retryAttempts > 0 ? 1 - e.agent.retryAttempts / e.baseline.retryAttempts : 0;

  return (
    <>
      <PageHeader
        title="Does the agent actually help?"
        description="We replayed the same dataset two ways: the old way (retry everything once, blindly) vs RecoveryOS (look first, act smart). Same data, different brains."
        actions={
          <>
            <Badge tone="outline">
              seed {e.seed} · n={e.datasetSize.toLocaleString("en-IN")}
            </Badge>
            <Button variant="outline" size="sm" onClick={runBenchmarkNow} disabled={running}>
              {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {running ? "Evaluating…" : "Re-run benchmark"}
            </Button>
          </>
        }
      />

      <div className="space-y-5 p-6">
        {/* The verdict, in one sentence */}
        <div className="rounded-lg border bg-card px-5 py-4">
          <p className="text-[15px] leading-relaxed">
            On the same {e.datasetSize.toLocaleString("en-IN")} payments, RecoveryOS recovered{" "}
            <b className="num text-success">{formatPct(uplift)} more money</b> while making{" "}
            <b className="num">{formatPct(retryReduction, 0)} fewer retry attempts</b>. Translation: it
            earns more by bothering customers less.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <MetricCard
            label="Extra money won"
            value={`+${formatPct(uplift)}`}
            sub={`Revenue went from ${formatCompactINR(e.baseline.revenueRecovered)} to ${formatCompactINR(e.agent.revenueRecovered)}`}
            tone="success"
          />
          <MetricCard
            label="Fewer retries"
            value={`${formatPct(retryReduction, 0)}`}
            sub={`${e.baseline.retryAttempts.toLocaleString()} attempts dropped to ${e.agent.retryAttempts.toLocaleString()}`}
            tone="info"
          />
          <MetricCard
            label="Wasted retries avoided"
            value={`${formatPct(e.baseline.unnecessaryRetryRate)} → ${formatPct(e.agent.unnecessaryRetryRate)}`}
            sub="Retries spent on payments that could never recover"
            tone="warning"
          />
          <MetricCard
            label="Better aim"
            value={`${formatPct(e.baseline.actionSuccessRate)} → ${formatPct(e.agent.actionSuccessRate)}`}
            sub="Share of actions that actually worked"
            tone="success"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Old way vs RecoveryOS, number by number</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 font-semibold">What we measure</th>
                  <th className="py-2 text-right font-semibold">Old way (blind retry)</th>
                  <th className="py-2 text-right font-semibold">RecoveryOS</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-border/60">
                {summaryRows.map(([metric, b, a]) => (
                  <tr key={metric}>
                    <td className="py-2">{metric}</td>
                    <td className="py-2 text-right text-muted-foreground">{b}</td>
                    <td className="py-2 text-right font-medium">{a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              How to read this: every number where the RecoveryOS column beats the old way is the
              agent earning its keep. Deterministic offline replay of the synthetic dataset · finished in{" "}
              {(e.durationMs / 1000).toFixed(1)}s · all demo data, no real payments involved.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Which failures does the agent fix best?</CardTitle>
            </CardHeader>
            <CardContent>
              <CompareChart
                data={e.byCategory.slice(0, 7).map((c) => ({
                  label: shortCategory(c.category).slice(0, 16),
                  baseline: Number((c.baselineRecoveryRate * 100).toFixed(1)),
                  agent: Number((c.agentRecoveryRate * 100).toFixed(1)),
                }))}
                name="recovery %"
                formatter={(v) => `${v}%`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Where the recovered money comes from</CardTitle>
            </CardHeader>
            <CardContent>
              <CompareChart
                data={e.byCategory.slice(0, 7).map((c) => ({
                  label: shortCategory(c.category).slice(0, 16),
                  baseline: 0,
                  agent: Math.round(c.agentRevenueRecovered),
                }))}
                name="revenue"
                formatter={(v) => formatCompactINR(v)}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Does it work for every payment method?</CardTitle>
          </CardHeader>
          <CardContent>
            <CompareChart
              data={e.byMethod.map((m) => ({
                label: m.method.toUpperCase(),
                baseline: Number((m.baselineRecoveryRate * 100).toFixed(1)),
                agent: Number((m.agentRecoveryRate * 100).toFixed(1)),
              }))}
              name="recovery %"
              formatter={(v) => `${v}%`}
            />
          </CardContent>
        </Card>

        <SectionLabel>Everything above is synthetic demo data — not real Razorpay results</SectionLabel>
      </div>
    </>
  );
}
