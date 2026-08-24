import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader } from "@/components/domain/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { GuardrailBadge, OutcomeBadge } from "@/components/domain/status";
import { actionCopy, eventTypeCopy, shortCategory } from "@/lib/copy";
import type { AgentRun } from "@/types/api";
import { cn, formatPct, timeAgo } from "@/lib/utils";

const RUN_STATUS: Record<string, { label: string; tone: "success" | "danger" | "warning" | "info" }> = {
  completed: { label: "Done", tone: "success" },
  blocked: { label: "Blocked", tone: "danger" },
  awaiting_review: { label: "Waiting on human", tone: "warning" },
  failed: { label: "Errored", tone: "danger" },
  running: { label: "Working…", tone: "info" },
};

function RunCard({ run }: { run: AgentRun }) {
  const [open, setOpen] = useState(false);
  const st = RUN_STATUS[run.status] ?? { label: run.status, tone: "info" as const };
  const ac = actionCopy(run.recommendation?.recommendedAction);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="font-medium">Agent looked at</span>
            <Link
              to={`/transactions/${run.transactionId}`}
              onClick={(e) => e.stopPropagation()}
              className="num font-medium text-info hover:underline"
            >
              {run.transactionId}
            </Link>
            {run.diagnosis ? (
              <span className="text-muted-foreground">
                · thinks it's a {shortCategory(run.diagnosis).toLowerCase()}
              </span>
            ) : null}
            {run.recommendation ? (
              <span>
                · decided to <b>{ac.label.toLowerCase()}</b>{" "}
                <span className="text-muted-foreground">({formatPct(run.recommendation.confidence, 0)} sure)</span>
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Badge tone={st.tone}>{st.label}</Badge>
            {run.guardrailResult ? <GuardrailBadge decision={run.guardrailResult.decision} /> : null}
            {run.executedAction ? <OutcomeBadge outcome={run.executedAction.outcome} /> : null}
            <span className={cn("num w-16 text-right text-[11px] text-muted-foreground", open && "hidden")}>
              {timeAgo(run.completedAt ?? run.startedAt)}
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </div>
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <CardContent className="border-t pt-3">
                {run.error ? (
                  <p className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">{run.error}</p>
                ) : null}
                <ol className="relative max-w-2xl">
                  {[...run.events].sort((a, b) => a.at.localeCompare(b.at)).map((e, i) => (
                    <li key={i} className="flex gap-3 pb-3 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-info" />
                        {i < run.events.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium leading-tight">{eventTypeCopy(e.node)}</p>
                        {e.detail ? <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{e.detail}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="num mt-3 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
                  trace id {run.correlationId} · brain:{" "}
                  {run.llmUsed ? `AI (${run.modelProvider}:${run.modelName})` : "deterministic rules"} · took{" "}
                  {run.latencyMs ?? "?"}ms
                </p>
              </CardContent>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

export function AgentActivityPage() {
  const [status, setStatus] = useState("all");
  const page = 1;
  const { data, loading, error, refetch } = useAsync(
    () => api.listRuns({ page, limit: 20, status }),
    [status]
  );

  return (
    <>
      <PageHeader
        title="What the agent is doing"
        description="Every row is one real workflow run: it reads the evidence, makes a call, passes safety checks, then acts (or refuses). Nothing here is faked."
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-52">
            <option value="all">Any outcome</option>
            <option value="completed">Completed</option>
            <option value="blocked">Blocked by policy</option>
            <option value="awaiting_review">Waiting on human</option>
            <option value="failed">Errored</option>
          </Select>
        }
      />
      <div className="space-y-3 p-6">
        {error ? <ErrorState message={error} onRetry={refetch} /> : null}
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : !data?.items.length ? (
          <EmptyState
            title="The agent hasn't done anything yet"
            description="Create a fake failed payment on the Simulation page and the agent will jump into action."
          />
        ) : (
          <>
            {data.items.map((run) => (
              <RunCard key={run.runId} run={run} />
            ))}
            {data.pagination.pages > 1 ? (
              <p className="pt-2 text-center text-xs text-muted-foreground">
                Showing latest {data.items.length} of {data.pagination.total.toLocaleString("en-IN")} runs
              </p>
            ) : null}
            <div className="flex justify-center pt-1">
              <Button variant="ghost" size="sm" onClick={refetch}>
                Refresh
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
