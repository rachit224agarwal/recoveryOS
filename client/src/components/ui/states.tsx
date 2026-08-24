import type { ReactNode } from "react";
import { AlertCircle, Inbox, RotateCcw } from "lucide-react";
import { Button } from "./button";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft">
        <AlertCircle className="h-5 w-5 text-danger" />
      </div>
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </Button>
      ) : null}
    </div>
  );
}
