"use client";

import type { TopDomainRow } from "@/types/api";

interface Props {
  topDomains: TopDomainRow[];
  onDomainClick?: (domain: string) => void;
}

export default function DomainCitationChart({ topDomains, onDomainClick }: Props) {
  const rows = topDomains.slice(0, 15);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-section">
        <h3 className="text-sm font-semibold mb-4">Top Cited Domains</h3>
        <p className="text-sm text-muted-foreground">No citation data available.</p>
      </div>
    );
  }

  const maxCitations = Math.max(...rows.map((d) => d.citations), 1);

  return (
    <div className="rounded-xl bg-card p-6 shadow-section">
      <h3 className="text-sm font-semibold mb-1">Top Cited Domains</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Most frequently cited domains across AI model responses
      </p>
      <div className="space-y-3">
        {rows.map((d) => (
          <div key={d.domain} className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onDomainClick?.(d.domain)}
              className="w-44 text-xs text-left text-muted-foreground truncate shrink-0 hover:text-foreground hover:underline underline-offset-2 transition-colors"
              title={d.domain}
            >
              {d.domain}
            </button>
            <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
              <div
                className="h-full rounded bg-[var(--chart-2)]"
                style={{ width: `${(d.citations / maxCitations) * 100}%` }}
              />
            </div>
            <span className="w-12 text-right text-xs font-medium tabular-nums">
              {d.citations}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
