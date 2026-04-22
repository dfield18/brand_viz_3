"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { VisibilityTrendPoint } from "@/types/api";

interface Props {
  brandName: string;
  industry?: string | null;
  trend: VisibilityTrendPoint[];
}

// Dynamic-import LandingDashboard so recharts (~100 kB gzipped)
// doesn't ship with the initial landing-page JS. Chunk loads only
// when the component actually mounts.
const LandingDashboard = dynamic(
  () =>
    import("@/components/landing/LandingDashboard").then((m) => ({
      default: m.LandingDashboard,
    })),
  {
    loading: () => (
      <div className="h-[380px] rounded-xl bg-muted/30 animate-pulse" />
    ),
  },
);

/**
 * IntersectionObserver wrapped as a useSyncExternalStore subscription
 * so the store hook — not a useEffect + setState — triggers the
 * re-render. Stays inside lint rule react-hooks/set-state-in-effect.
 */
function useInView(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const inViewRef = useRef(false);

  const subscribe = useCallback(
    (notify: () => void) => {
      const target = ref.current;
      if (!target || typeof IntersectionObserver === "undefined") {
        // Older browsers (and SSR) — render immediately.
        if (!inViewRef.current) {
          inViewRef.current = true;
          notify();
        }
        return () => {};
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !inViewRef.current) {
            inViewRef.current = true;
            notify();
            observer.disconnect();
          }
        },
        { rootMargin: "500px 0px" },
      );
      observer.observe(target);
      return () => observer.disconnect();
    },
    [ref],
  );

  return useSyncExternalStore(
    subscribe,
    () => inViewRef.current,
    () => false,
  );
}

/**
 * Defer-render wrapper for the landing-page demo dashboard. Renders
 * an animated-pulse placeholder until the section is within 500 px
 * of the viewport, then swaps in the real chart + its recharts JS.
 */
export function LazyLandingDashboard(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);

  return (
    <div ref={ref} className="min-h-[380px]">
      {visible ? (
        <LandingDashboard {...props} />
      ) : (
        <div className="h-[380px] rounded-xl bg-muted/30 animate-pulse" />
      )}
    </div>
  );
}
