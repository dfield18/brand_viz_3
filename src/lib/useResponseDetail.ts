"use client";

import { useCallback, useRef } from "react";
import { useResponseViewer } from "@/components/ResponseViewer";

interface PromptQuery {
  promptText: string;
  model?: string;
  brandName?: string;
  /** "content" for narrative previews, "query_universe" for visibility drilldowns */
  scopeMode?: "content" | "query_universe";
}

interface PositionQuery {
  model: string;
  positionMin: number;
  positionMax: number | null;
  positionLabel: string;
  brandName?: string;
  /** "content" for narrative previews, "query_universe" for visibility drilldowns */
  scopeMode?: "content" | "query_universe";
}

/**
 * Hook that fetches response detail and opens the ResponseViewer modal.
 * Supports two modes:
 *   1. By prompt text: openResponse({ promptText, model })
 *   2. By model + position: openByPosition({ model, positionMin, positionMax, positionLabel })
 */
export function useResponseDetail(brandSlug: string) {
  const viewer = useResponseViewer();
  const loadingRef = useRef(false);

  const openResponse = useCallback(
    async (opts: PromptQuery) => {
      if (loadingRef.current || !brandSlug) return;
      loadingRef.current = true;

      try {
        const params = new URLSearchParams({
          brandSlug,
          promptText: opts.promptText,
        });
        if (opts.model && opts.model !== "all") {
          params.set("model", opts.model);
        }
        if (opts.scopeMode) {
          params.set("scopeMode", opts.scopeMode);
        }

        const res = await fetch(`/api/response-detail?${params}`);
        if (!res.ok) return;

        const data = await res.json();
        if (!data.responses || data.responses.length === 0) {
          viewer.open({
            responseText: "No response data available for this prompt. This may be using demo data that doesn't have stored responses.",
            promptText: opts.promptText,
            model: opts.model ?? "all",
            brandName: opts.brandName ?? brandSlug,
          });
          return;
        }

        const r = data.responses[0];
        viewer.open({
          responseText: r.responseText,
          promptText: r.prompt.text,
          model: r.model,
          brandName: opts.brandName ?? data.brandName ?? brandSlug,
          cluster: r.prompt.cluster ?? undefined,
          intent: r.prompt.intent ?? undefined,
          date: r.date,
          analysis: r.analysis,
        });
      } finally {
        loadingRef.current = false;
      }
    },
    [brandSlug, viewer]
  );

  const openByPosition = useCallback(
    async (opts: PositionQuery) => {
      if (loadingRef.current || !brandSlug) return;
      loadingRef.current = true;

      try {
        const params = new URLSearchParams({
          brandSlug,
          model: opts.model,
          positionMin: String(opts.positionMin),
        });
        if (opts.positionMax !== null) {
          params.set("positionMax", String(opts.positionMax));
        }
        if (opts.scopeMode) {
          params.set("scopeMode", opts.scopeMode);
        }

        const res = await fetch(`/api/response-detail?${params}`);
        if (!res.ok) return;

        const data = await res.json();
        if (!data.responses || data.responses.length === 0) {
          viewer.open({
            responseText: `No response data available for ${opts.positionLabel} position. This may be using demo data that doesn't have stored responses.`,
            promptText: `${opts.positionLabel} position responses`,
            model: opts.model,
            brandName: opts.brandName ?? brandSlug,
          });
          return;
        }

        const r = data.responses[0];
        viewer.open({
          responseText: r.responseText,
          promptText: r.prompt.text,
          model: r.model,
          brandName: opts.brandName ?? data.brandName ?? brandSlug,
          cluster: r.prompt.cluster ?? undefined,
          intent: r.prompt.intent ?? undefined,
          date: r.date,
          analysis: r.analysis,
        });
      } finally {
        loadingRef.current = false;
      }
    },
    [brandSlug, viewer]
  );

  const openByRunId = useCallback(
    async (runId: string, opts?: { brandName?: string }) => {
      if (loadingRef.current || !runId) return;
      loadingRef.current = true;

      try {
        const res = await fetch(`/api/response-detail?runId=${encodeURIComponent(runId)}`);
        if (!res.ok) return;

        const data = await res.json();
        if (!data.responses || data.responses.length === 0) return;

        const r = data.responses[0];
        viewer.open({
          responseText: r.responseText,
          promptText: r.prompt.text,
          model: r.model,
          brandName: opts?.brandName ?? data.brandName ?? brandSlug,
          cluster: r.prompt.cluster ?? undefined,
          intent: r.prompt.intent ?? undefined,
          date: r.date,
          analysis: r.analysis,
        });
      } finally {
        loadingRef.current = false;
      }
    },
    [brandSlug, viewer]
  );

  return { openResponse, openByPosition, openByRunId };
}
