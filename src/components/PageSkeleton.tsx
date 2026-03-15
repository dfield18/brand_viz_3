import { Loader2 } from "lucide-react";

/**
 * Consistent page-level loading skeleton used across all entity tab pages.
 *
 * Variants:
 * - "cards": KPI card grid + chart skeleton (Overview, Visibility)
 * - "content": Spinner with contextual message (all other tabs)
 */
export function PageSkeleton({
  variant = "content",
  label,
  children,
}: {
  variant?: "cards" | "content";
  label?: string;
  children?: React.ReactNode;
}) {
  if (variant === "cards") {
    return (
      <div className="space-y-8">
        {children}
        {/* KPI card skeletons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card px-4 py-4 shadow-kpi animate-pulse">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="h-3 w-3 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
              <div className="h-7 w-14 bg-muted rounded mt-1" />
              <div className="h-2.5 w-full bg-muted/50 rounded mt-3" />
            </div>
          ))}
        </div>
        {/* Chart skeleton */}
        <div className="rounded-xl bg-card p-6 shadow-section animate-pulse">
          <div className="h-4 w-48 bg-muted rounded mb-6" />
          <div className="h-52 bg-muted/40 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {children}
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
        {label && (
          <span className="text-sm text-muted-foreground">{label}</span>
        )}
      </div>
    </div>
  );
}
