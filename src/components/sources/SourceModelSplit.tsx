"use client";

import { useState } from "react";
import type { SourceModelSplitRow, SourcesResponse } from "@/types/api";
import { MODEL_LABELS, CLUSTER_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface ApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface Props {
  modelSplit: SourceModelSplitRow[];
  brandSlug: string;
  range: number;
  pageModel: string;
}

const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0";

export default function SourceModelSplit({ modelSplit: initialModelSplit, brandSlug, range, pageModel }: Props) {
  const [cluster, setCluster] = useState("all");

  const needsFetch = cluster !== "all";
  const url = needsFetch
    ? `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${pageModel}&range=${range}&cluster=${cluster}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const modelSplit = needsFetch && apiData?.sources?.modelSplit
    ? apiData.sources.modelSplit
    : needsFetch && apiData && !apiData.sources ? [] : initialModelSplit;
  if (!loading && modelSplit.length <= 1) return null;

  // Collect all unique domains across models
  const allDomains = new Set<string>();
  for (const ms of modelSplit) {
    for (const d of ms.domains) {
      allDomains.add(d.domain);
    }
  }
  const domainList = [...allDomains];

  if (!loading && domainList.length === 0) return null;

  // Build lookup: model → domain → citations
  const lookup = new Map<string, Map<string, number>>();
  for (const ms of modelSplit) {
    const domainMap = new Map<string, number>();
    for (const d of ms.domains) {
      domainMap.set(d.domain, d.citations);
    }
    lookup.set(ms.model, domainMap);
  }

  return (
    <div className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">Which Sources Each AI Platform Prefers</h3>
          <p className="text-xs text-muted-foreground">
            Different AI platforms rely on different websites — see which sources each platform cites most
          </p>
        </div>
        <select value={cluster} onChange={(e) => setCluster(e.target.value)} className={selectClass}>
          {Object.entries(CLUSTER_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      )}
      {!loading && <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 pr-4 font-medium">Model</th>
              {domainList.map((d) => (
                <th key={d} className="text-center py-2 px-2 font-medium truncate max-w-[120px]" title={d}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modelSplit.map((ms) => (
              <tr key={ms.model} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium whitespace-nowrap">
                  {MODEL_LABELS[ms.model] ?? ms.model}
                </td>
                {domainList.map((d) => {
                  const count = lookup.get(ms.model)?.get(d);
                  return (
                    <td key={d} className="text-center py-2 px-2 tabular-nums">
                      {count !== undefined ? (
                        <span className="font-medium">{count}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  );
}
