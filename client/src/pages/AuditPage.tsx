import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader } from "@/components/domain/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { eventTypeCopy } from "@/lib/copy";
import { formatDateTime } from "@/lib/utils";

const TYPES = [
  "all",
  "RUN_STARTED",
  "RECOMMENDATION_GENERATED",
  "GUARDRAIL_DECISION",
  "ACTION_EXECUTED",
  "OUTCOME_VERIFIED",
  "BLOCKED",
  "ESCALATED",
];

const TYPE_TONE: Record<string, "success" | "danger" | "warning" | "info" | "neutral"> = {
  RUN_STARTED: "neutral",
  DIAGNOSIS_RECORDED: "neutral",
  EVIDENCE_RETRIEVED: "neutral",
  RECOMMENDATION_GENERATED: "info",
  GUARDRAIL_DECISION: "warning",
  ACTION_EXECUTED: "info",
  OUTCOME_VERIFIED: "success",
  BLOCKED: "danger",
  ESCALATED: "warning",
  RUN_FAILED: "danger",
};

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState("all");
  const { data, loading, error, refetch } = useAsync(
    () => api.listAudit({ page, limit: 30, type }),
    [page, type]
  );

  return (
    <>
      <PageHeader
        title="Paper trail"
        description="Every decision the system ever made, written down forever. If anyone asks 'why did it do that?' — the answer is here."
        actions={
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            className="w-52"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "All event types" : t.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        }
      />
      <div className="p-6">
        <Card>
          {error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <EmptyState
              title="Nothing to show yet"
              description="Run the recovery workflow once and every decision will be written down here, permanently."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Time</TableHead>
                    <TableHead className="w-44">Event</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead className="w-44 text-right">Correlation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((a) => (
                    <TableRow key={a.eventId}>
                      <TableCell className="num whitespace-nowrap text-[11.5px] text-muted-foreground">
                        {formatDateTime(a.at)}
                      </TableCell>
                      <TableCell>
                        <Badge tone={TYPE_TONE[a.type] ?? "neutral"}>{eventTypeCopy(a.type)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/transactions/${a.transactionId}`}
                          className="num font-medium text-info hover:underline"
                        >
                          {a.transactionId}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-md truncate text-xs">{a.summary}</TableCell>
                      <TableCell>
                        <span className="capitalize text-xs text-muted-foreground">{a.actor}</span>
                      </TableCell>
                      <TableCell className="num text-right text-[10.5px] text-muted-foreground">
                        {a.correlationId ? `${a.correlationId.slice(0, 12)}…` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t px-4 py-2.5">
                <p className="text-xs text-muted-foreground">
                  {data.pagination.total.toLocaleString("en-IN")} recorded decisions · page {data.pagination.page} of{" "}
                  {data.pagination.pages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
