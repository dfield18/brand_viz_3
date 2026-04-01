/**
 * Consistent page-level loading skeleton used across all entity tab pages.
 *
 * Variants:
 * - "cards": Overview-style layout (4 scorecard cards + chart + table)
 * - "content": Centered subtle spinner (all other tabs)
 */
export function PageSkeleton({
  variant = "content",
  label: _label,
  children,
}: {
  variant?: "cards" | "content";
  label?: string;
  children?: React.ReactNode;
}) {
  if (variant === "cards") {
    return (
      <div className="space-y-6">
        {children}

        {/* Scorecard skeleton — 4 cards matching overview layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card px-5 py-5 shadow-kpi border-l-[3px] border-border/30">
              <div className="h-2.5 w-24 bg-muted/60 rounded skeleton-shimmer mb-4" />
              <div className="h-8 w-16 bg-muted/50 rounded skeleton-shimmer mb-3" />
              <div className="h-2 w-full bg-muted/30 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>

        {/* Insight skeleton */}
        <div className="rounded-xl bg-card px-5 py-4 shadow-section">
          <div className="h-3 w-64 bg-muted/50 rounded skeleton-shimmer mb-2" />
          <div className="h-2.5 w-full bg-muted/30 rounded skeleton-shimmer" />
        </div>

        {/* Trend chart skeleton */}
        <div className="rounded-xl bg-card p-6 shadow-section">
          <div className="flex items-center justify-between mb-6">
            <div className="h-3 w-40 bg-muted/50 rounded skeleton-shimmer" />
            <div className="flex gap-2">
              <div className="h-7 w-20 bg-muted/30 rounded-full skeleton-shimmer" />
              <div className="h-7 w-20 bg-muted/30 rounded-full skeleton-shimmer" />
            </div>
          </div>
          <div className="h-6 w-14 bg-muted/50 rounded skeleton-shimmer mb-4" />
          <div className="h-56 bg-muted/20 rounded-lg skeleton-shimmer" />
        </div>

        {/* Table skeleton */}
        <div className="rounded-xl bg-card p-6 shadow-section">
          <div className="h-3 w-52 bg-muted/50 rounded skeleton-shimmer mb-5" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6">
                <div className="h-3 w-20 bg-muted/40 rounded skeleton-shimmer" />
                <div className="h-3 w-12 bg-muted/30 rounded skeleton-shimmer" />
                <div className="h-3 w-12 bg-muted/30 rounded skeleton-shimmer" />
                <div className="h-3 w-12 bg-muted/30 rounded skeleton-shimmer" />
                <div className="h-3 w-16 bg-muted/30 rounded skeleton-shimmer" />
                <div className="h-3 w-16 bg-muted/30 rounded skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {children}
      {/* Generic content skeleton */}
      <div className="space-y-6 py-4">
        <div className="rounded-xl bg-card p-6 shadow-section">
          <div className="h-3 w-48 bg-muted/50 rounded skeleton-shimmer mb-4" />
          <div className="h-2.5 w-full bg-muted/30 rounded skeleton-shimmer mb-2" />
          <div className="h-2.5 w-3/4 bg-muted/30 rounded skeleton-shimmer" />
        </div>
        <div className="rounded-xl bg-card p-6 shadow-section">
          <div className="h-3 w-40 bg-muted/50 rounded skeleton-shimmer mb-4" />
          <div className="h-48 bg-muted/20 rounded-lg skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}
