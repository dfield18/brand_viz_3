"use client";

import type { NarrativeDescriptor } from "@/types/api";

interface DescriptorsChartProps {
  descriptors: NarrativeDescriptor[];
}

const POLARITY_TEXT: Record<string, string> = {
  positive: "text-emerald-600",
  negative: "text-red-500",
  neutral: "text-muted-foreground",
};

const POLARITY_DOT: Record<string, string> = {
  positive: "bg-emerald-500",
  negative: "bg-red-400",
  neutral: "bg-gray-400",
};

// Map descriptor words to semantic categories
const WORD_CATEGORY: Record<string, string> = {
  // Reputation
  trusted: "Reputation",
  respected: "Reputation",
  renowned: "Reputation",
  popular: "Reputation",
  successful: "Reputation",
  leading: "Reputation",
  controversial: "Reputation",
  questionable: "Reputation",
  // Product
  reliable: "Product",
  robust: "Product",
  efficient: "Product",
  effective: "Product",
  versatile: "Product",
  premium: "Product",
  unreliable: "Product",
  slow: "Product",
  inadequate: "Product",
  outdated: "Product",
  durable: "Product",
  // Innovation
  innovative: "Innovation",
  dynamic: "Innovation",
  // Market Position
  competitive: "Market Position",
  powerful: "Market Position",
  strong: "Market Position",
  impressive: "Market Position",
  comprehensive: "Market Position",
  weak: "Market Position",
  niche: "Market Position",
  limited: "Market Position",
  // Value
  expensive: "Value",
  overpriced: "Value",
  // Experience
  excellent: "Experience",
  confusing: "Experience",
  complex: "Experience",
  difficult: "Experience",
  risky: "Experience",
  inconsistent: "Experience",
};

function categorize(word: string): string {
  return WORD_CATEGORY[word.toLowerCase()] ?? "Other";
}

export function DescriptorsChart({ descriptors }: DescriptorsChartProps) {
  if (!descriptors || descriptors.length === 0) {
    return <p className="text-sm text-muted-foreground">No descriptor data available.</p>;
  }

  // Group by category
  const groups = new Map<string, NarrativeDescriptor[]>();
  for (const desc of descriptors) {
    const cat = categorize(desc.word);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(desc);
  }

  // Sort categories: "Other" last, otherwise by total count descending
  const sorted = Array.from(groups.entries()).sort((a, b) => {
    if (a[0] === "Other") return 1;
    if (b[0] === "Other") return -1;
    const sumA = a[1].reduce((s, d) => s + d.count, 0);
    const sumB = b[1].reduce((s, d) => s + d.count, 0);
    return sumB - sumA;
  });

  return (
    <div className="space-y-5">
      {sorted.map(([category, items]) => (
        <div key={category}>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {category}
          </h3>
          <ul className="space-y-1.5 pl-1">
            {items
              .sort((a, b) => b.count - a.count)
              .map((desc) => (
                <li key={desc.word} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${POLARITY_DOT[desc.polarity]}`} />
                  <span className={`font-medium ${POLARITY_TEXT[desc.polarity]}`}>
                    {desc.word}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({desc.count})
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
