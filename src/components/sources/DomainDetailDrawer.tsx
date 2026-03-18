"use client";

import { X, Loader2 } from "lucide-react";
import { MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";
import type { DomainDetailResponse } from "@/types/api";

interface Props {
  domain: string | null;
  brandSlug: string;
  model: string;
  range: number;
  onClose: () => void;
}

export default function DomainDetailDrawer({ domain, brandSlug, model, range, onClose }: Props) {
  const url = domain
    ? `/api/sources/domain-detail?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}&domain=${encodeURIComponent(domain)}`
    : null;

  const { data, loading, error } = useCachedFetch<DomainDetailResponse>(url);

  if (!domain) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] max-w-full bg-card border-l shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate">{domain}</h2>
          <p className="text-xs text-muted-foreground">
            {data ? `${data.totalOccurrences} total occurrence${data.totalOccurrences !== 1 ? "s" : ""}` : "Loading..."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading examples...</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {data && data.examples.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No citation examples found for this domain.
          </p>
        )}

        {data?.examples?.map((ex, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium bg-muted px-2 py-0.5 rounded">
                {MODEL_LABELS[ex.model] ?? ex.model}
              </span>
              {ex.entityId && (
                <span className="text-[11px] text-muted-foreground">
                  Entity: {ex.entityId}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground ml-auto">
                {new Date(ex.createdAt).toLocaleDateString()}
              </span>
            </div>

            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Prompt</p>
              <p className="text-xs">{ex.promptText}</p>
            </div>

            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Response excerpt</p>
              <p className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all">
                {ex.responseExcerpt}
              </p>
            </div>

            <div className="flex gap-4 text-[11px] text-muted-foreground">
              <span>URL: <span className="font-mono break-all">{ex.normalizedUrl}</span></span>
            </div>

            {ex.brandRank !== null && (
              <div className="flex gap-4 text-[11px]">
                <span>Rank: <span className="font-medium tabular-nums">#{ex.brandRank}</span></span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
