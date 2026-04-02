import { Loader2 } from "lucide-react";

/**
 * Page-level loading indicator — progress bar at top + centered spinner.
 */
export function PageSkeleton({
  label: _label,
  variant: _variant,
  children: _children,
}: {
  variant?: "cards" | "content";
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      {/* Top progress bar */}
      <div className="fixed top-0 left-0 right-0 z-[100] h-[3px]">
        <div className="h-full bg-primary/80 progress-bar-animate" />
      </div>
      {/* Centered spinner */}
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
      </div>
    </div>
  );
}
