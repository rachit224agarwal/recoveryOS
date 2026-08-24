import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "@/services/api";
import { useAsync } from "@/hooks/useAsync";
import { PageHeader } from "@/components/domain/PageHeader";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/domain/status";
import { actionCopy, categoryCopy, codeCopy, methodLabel, shortCategory, statusCopy } from "@/lib/copy";
import { formatCompactINR, formatDateTime } from "@/lib/utils";
import type { TransactionStatus } from "@/types/api";

const CATEGORIES = [
  "all",
  "temporary_failure",
  "insufficient_balance",
  "authentication_issue",
  "mandate_issue",
  "checkout_abandonment",
  "repeated_failure",
  "unknown",
];

const STATUSES = ["all", "failed", "in_review", "escalated", "recovered", "terminal"];
const METHODS = ["all", "upi", "card", "netbanking", "wallet"];

export function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");

  const page = Number(params.get("page") ?? 1);
  const status = params.get("status") ?? "all";
  const category = params.get("category") ?? "all";
  const method = params.get("method") ?? "all";

  const query = useMemo(
    () => ({
      page,
      limit: 15,
      q: search.trim() || undefined,
      status,
      category,
      method,
    }),
    [page, search, status, category, method]
  );

  const { data, loading, error, refetch } = useAsync(
    () => api.listTransactions(query),
    [query.page, query.q, query.status, query.category, query.method]
  );

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === "all") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };

  return (
    <>
      <PageHeader
        title="Failed payments"
        description="One row per failed payment: why it failed, where it stands, and what the agent decided to do about it."
      />

      <div className="p-6">
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by transaction ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && update({ q: search.trim() })}
                onBlur={() => update({ q: search.trim() })}
                className="pl-8"
              />
            </div>
            <Select value={status} onChange={(e) => update({ status: e.target.value })} className="w-52">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "Any state" : statusCopy(s as TransactionStatus).label}
                </option>
              ))}
            </Select>
            <Select value={category} onChange={(e) => update({ category: e.target.value })} className="w-64">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "Any reason" : categoryCopy(c)}                </option>
              ))}
            </Select>
            <Select value={method} onChange={(e) => update({ method: e.target.value })} className="w-44">
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m === "all" ? "Paid any way" : `Paid by ${methodLabel(m)}`}
                </option>
              ))}
            </Select>
          </div>

          {error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <EmptyState
              title="Nothing matches these filters"
              description="Try clearing a filter — or create a fresh failed payment on the Simulation page."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Why it failed</TableHead>
                    <TableHead>Where it stands</TableHead>
                    <TableHead>What the agent did</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((t) => {
                    const ac = actionCopy(t.latestDecision?.action);
                    return (
                      <TableRow key={t.transactionId}>
                        <TableCell>
                          <Link
                            to={`/transactions/${t.transactionId}`}
                            className="num font-medium text-info hover:underline"
                          >
                            {t.transactionId}
                          </Link>
                          <span className="block text-[11px] text-muted-foreground">
                            {t.merchantName} · {methodLabel(t.paymentMethod)}
                          </span>
                        </TableCell>
                        <TableCell className="num font-medium">{formatCompactINR(t.amount)}</TableCell>
                        <TableCell className="max-w-56">
                          <span className="block truncate text-xs font-medium">
                            {shortCategory(t.failureCategory)}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {codeCopy(t.failureCode)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={t.status as TransactionStatus} />
                          <span className="mt-0.5 block max-w-40 truncate text-[11px] text-muted-foreground">
                            {statusCopy(t.status as TransactionStatus).blurb}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {t.latestDecision ? (
                            <>
                              <span className="font-medium">{ac.label}</span>
                              <span className="block max-w-48 truncate text-[11px] text-muted-foreground">
                                {ac.blurb}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Haven't looked at it yet</span>
                          )}
                        </TableCell>
                        <TableCell className="num text-right text-[11.5px] text-muted-foreground">
                          {formatDateTime(t.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t px-4 py-2.5">
                <p className="text-xs text-muted-foreground">
                  {data.pagination.total.toLocaleString("en-IN")} payments · page{" "}
                  {data.pagination.page} of {data.pagination.pages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => update({ page: String(page - 1) })}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.pages}
                    onClick={() => update({ page: String(page + 1) })}
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
