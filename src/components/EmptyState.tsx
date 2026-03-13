import { Inbox } from "lucide-react";

interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
}

export function EmptyState({ message, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/50 p-10 text-center">
      <div className="mb-3 text-muted-foreground">
        {icon ?? <Inbox className="h-10 w-10" />}
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
