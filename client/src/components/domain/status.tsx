import { Badge } from "@/components/ui/badge";
import type { RecommendedAction, TransactionStatus } from "@/types/api";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock,
  EyeOff,
  Link2,
  RefreshCw,
  UserX,
} from "lucide-react";

const STATUS_META: Record<
  TransactionStatus,
  { label: string; tone: "success" | "danger" | "warning" | "info" | "neutral" }
> = {
  failed: { label: "Failed", tone: "danger" },
  analyzing: { label: "Analyzing", tone: "info" },
  in_review: { label: "In review", tone: "warning" },
  escalated: { label: "Escalated", tone: "warning" },
  recovered: { label: "Recovered", tone: "success" },
  terminal: { label: "Terminal", tone: "neutral" },
};

export function StatusBadge({ status }: { status: TransactionStatus }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function CategoryLabel({ category }: { category: string }) {
  return <span className="capitalize">{category.replace(/_/g, " ")}</span>;
}

export function ActionIcon({ action, className }: { action: RecommendedAction; className?: string }) {
  switch (action) {
    case "retry_payment":
      return <RefreshCw className={className} />;
    case "schedule_retry":
      return <CalendarClock className={className} />;
    case "create_payment_link":
      return <Link2 className={className} />;
    case "send_recovery_notification":
      return <BellRing className={className} />;
    case "escalate_to_human":
      return <UserX className={className} />;
    case "no_action":
      return <EyeOff className={className} />;
    default:
      return <ArrowRight className={className} />;
  }
}

export function GuardrailBadge({ decision }: { decision: "ALLOW" | "BLOCK" | "HUMAN_REVIEW" }) {
  if (decision === "ALLOW") {
    return (
      <Badge tone="success">
        <CheckCircle2 className="h-3 w-3" /> Policy pass
      </Badge>
    );
  }
  if (decision === "BLOCK") {
    return (
      <Badge tone="danger">
        <Ban className="h-3 w-3" /> Blocked
      </Badge>
    );
  }
  return (
    <Badge tone="warning">
      <AlertTriangle className="h-3 w-3" /> Human review
    </Badge>
  );
}

export function OutcomeBadge({ outcome }: { outcome?: "SUCCESS" | "FAILED" | "PENDING" | "BLOCKED" }) {
  if (!outcome) return <span className="text-xs text-muted-foreground">—</span>;
  if (outcome === "SUCCESS")
    return (
      <Badge tone="success">
        <CheckCircle2 className="h-3 w-3" /> Success
      </Badge>
    );
  if (outcome === "PENDING")
    return (
      <Badge tone="info">
        <Clock className="h-3 w-3" /> Pending
      </Badge>
    );
  return (
    <Badge tone="danger">
      <Ban className="h-3 w-3" /> Failed
    </Badge>
  );
}
