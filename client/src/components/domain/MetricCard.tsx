import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
  loading?: boolean;
}) {
  const toneRing: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    info: "bg-info-soft text-info",
  };

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className={cn("num mt-1 truncate text-[22px] font-semibold leading-tight")}>{value}</p>
          )}
          {sub ? <div className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</div> : null}
        </div>
        {icon ? (
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", toneRing[tone])}>
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}
