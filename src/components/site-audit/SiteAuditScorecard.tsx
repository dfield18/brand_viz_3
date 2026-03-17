"use client";

import { Info } from "lucide-react";

interface Props {
  overall: number;
  llmAccessibility: number;
  metaQuality: number;
  structuredData: number;
  contentStructure: number;
  technicalHealth: number;
  brandName?: string;
}

function DonutRing({ percentage, color, size = 80, strokeWidth = 8 }: { percentage: number; color: string; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  const center = size / 2;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
      <circle
        cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`} className="transition-all duration-500"
      />
    </svg>
  );
}

function getBadge(score: number): { text: string; color: string } {
  if (score >= 80) return { text: "Excellent", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (score >= 60) return { text: "Good", color: "text-blue-700 bg-blue-50 border-blue-200" };
  if (score >= 40) return { text: "Needs Work", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Poor", color: "text-red-700 bg-red-50 border-red-200" };
}

function getColor(score: number): string {
  if (score >= 80) return "hsl(160, 60%, 40%)";
  if (score >= 60) return "hsl(210, 70%, 50%)";
  if (score >= 40) return "hsl(38, 90%, 50%)";
  return "hsl(0, 70%, 50%)";
}

function getTooltips(name: string): Record<string, string> {
  return {
    overall: "Weighted average of all category scores. Higher is better.",
    llmAccessibility: `Can AI crawlers (GPTBot, ClaudeBot, etc.) access ${name}'s site? Checks robots.txt rules and sitemap availability.`,
    metaQuality: `Quality of HTML meta tags (title, description, Open Graph) that help AI models understand ${name}'s content.`,
    structuredData: `Presence of JSON-LD/Schema.org markup that provides machine-readable context about ${name}.`,
    contentStructure: `How well ${name}'s content is organized with headings, alt text, and logical hierarchy.`,
    technicalHealth: "HTTPS, sitemap, canonical URLs, and page load performance.",
  };
}

export function SiteAuditScorecard(props: Props) {
  const TOOLTIPS = getTooltips(props.brandName || "this site");
  const cards: {
    key: string;
    label: string;
    score: number;
  }[] = [
    { key: "overall", label: "Overall AI-Readiness", score: props.overall },
    { key: "llmAccessibility", label: "LLM Accessibility", score: props.llmAccessibility },
    { key: "metaQuality", label: "Meta Tag Quality", score: props.metaQuality },
    { key: "structuredData", label: "Structured Data", score: props.structuredData },
    { key: "contentStructure", label: "Content Structure", score: props.contentStructure },
    { key: "technicalHealth", label: "Technical Health", score: props.technicalHealth },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => {
        const badge = getBadge(card.score);
        const color = getColor(card.score);
        return (
          <div
            key={card.key}
            className="rounded-xl bg-card px-4 py-4 shadow-kpi flex flex-col items-center text-center"
          >
            <div className="flex items-center gap-1 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {card.label}
              </span>
              <div className="group relative">
                <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                  {TOOLTIPS[card.key]}
                </div>
              </div>
            </div>
            <div className="relative flex items-center justify-center h-[80px]">
              <DonutRing percentage={card.score} color={color} />
              <span className="absolute text-lg font-bold">{card.score}</span>
            </div>
            <span className={`mt-3 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.color}`}>
              {badge.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
