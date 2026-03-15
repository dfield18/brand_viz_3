"use client";

import type { TopicOwnershipRow, TopicFragmentationRow } from "@/types/api";

interface Props {
  ownership: TopicOwnershipRow[];
  fragmentation: TopicFragmentationRow[];
  brandSlug: string;
}

const LABEL_COLOR: Record<string, string> = {
  Fragmented: "text-emerald-600",
  Moderate: "text-amber-500",
  Concentrated: "text-red-500",
};

export default function TopicOwnershipTable({ ownership, fragmentation, brandSlug }: Props) {
  if (ownership.length === 0) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-section">
        <h3 className="text-sm font-semibold mb-4">Topic Ownership</h3>
        <p className="text-sm text-muted-foreground">No ownership data available.</p>
      </div>
    );
  }

  // Build fragmentation lookup by topicKey
  const fragMap = new Map(fragmentation.map((f) => [f.topicKey, f]));

  return (
    <div className="rounded-xl bg-card p-6 shadow-section">
      <h3 className="text-sm font-semibold mb-1">Topic Ownership</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Which entity dominates each topic and how competitive it is
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 pr-3 font-medium">Topic</th>
              <th className="text-left py-2 px-3 font-medium">Leader</th>
              <th className="text-right py-2 px-3 font-medium">Leader Share</th>
              <th className="text-right py-2 px-3 font-medium">Your Share</th>
              <th className="text-right py-2 px-3 font-medium">Your Rank</th>
              <th className="text-left py-2 px-3 font-medium">Competition</th>
              <th className="text-left py-2 pl-3 font-medium">Leader Share</th>
            </tr>
          </thead>
          <tbody>
            {ownership.map((row) => {
              const brandLeads = row.leaderEntityId === brandSlug;
              const frag = fragMap.get(row.topicKey);
              return (
                <tr
                  key={row.topicKey}
                  className={`border-b last:border-0 ${brandLeads ? "bg-emerald-50 dark:bg-emerald-950/20" : ""}`}
                >
                  <td className="py-2 pr-3 font-medium truncate" title={row.topicLabel}>{row.topicLabel}</td>
                  <td className="py-2 px-3 truncate" title={row.leaderName}>
                    <span className={brandLeads ? "text-emerald-700 dark:text-emerald-400 font-medium" : ""}>
                      {row.leaderName}
                    </span>
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {row.leaderMentionShare.toFixed(1)}%
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {row.brandMentionShare.toFixed(1)}%
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {row.brandRank !== null ? `#${row.brandRank}` : "—"}
                  </td>
                  <td className="py-2 px-3">
                    {frag ? (
                      <span className={`font-semibold ${LABEL_COLOR[frag.label] ?? ""}`}>
                        {frag.label}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 pl-3">
                    {frag && (
                      <div className="w-14 h-3 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full rounded bg-primary/60"
                          style={{ width: `${Math.min(frag.leaderShare, 100)}%` }}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
