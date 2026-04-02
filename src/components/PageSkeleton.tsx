/**
 * Page-level loading indicator — thin animated progress bar at the top.
 *
 * Renders any children (e.g. page header) immediately, with a progress
 * bar sliding across the top to signal that content is loading.
 */
export function PageSkeleton({
  label: _label,
  variant: _variant,
  children,
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
      {children}
    </div>
  );
}
