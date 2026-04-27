"use client";

import type { TopicFragmentationRow } from "@/types/api";
import { subjectNounPlural } from "@/lib/subjectNoun";

interface Props {
  fragmentation: TopicFragmentationRow[];
  brandName?: string;
  category?: string | null;
}

const LABEL_COLOR: Record<string, string> = {
  Fragmented: "text-emerald-600",
  Moderate: "text-amber-500",
  Concentrated: "text-red-500",
};

export default function TopicFragmentation({ fragmentation, brandName, category }: Props) {
  const peerNounPlural = subjectNounPlural(brandName ?? "Brand", category);
  if (fragmentation.length === 0) {
    return (
      <section className="rounded-xl bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold mb-4">Topic Fragmentation</h2>
        <p className="text-sm text-muted-foreground">No fragmentation data available.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-1">Topic Fragmentation</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Whether topics are contested by many {peerNounPlural} or dominated by one
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Topic</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Competition</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Leader</th>
              <th className="py-2 pl-3 text-right font-medium text-muted-foreground">Leader Share</th>
            </tr>
          </thead>
          <tbody>
            {fragmentation.map((row) => (
              <tr key={row.topicKey} className="border-b border-border/30 hover:bg-muted/20">
                <td className="py-2.5 pr-4 font-medium">{row.topicLabel}</td>
                <td className="py-2.5 px-3">
                  <span className={`font-semibold ${LABEL_COLOR[row.label] ?? ""}`}>
                    {row.label}
                  </span>
                </td>
                <td className="py-2.5 px-3">{row.leaderName}</td>
                <td className="py-2.5 pl-3 text-right tabular-nums">
                  {row.leaderShare}%
                  <div className="inline-block ml-2 w-16 h-3 rounded bg-muted overflow-hidden align-middle">
                    <div
                      className="h-full rounded bg-primary/60"
                      style={{ width: `${Math.min(row.leaderShare, 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
