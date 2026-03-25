"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
  Customized,
} from "recharts";
import { ExternalLink, Loader2, X } from "lucide-react";
import type { SentimentByQuestionEntry, NarrativeResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { useResponseDetail } from "@/lib/useResponseDetail";

interface SentimentByQuestionProps {
  data: SentimentByQuestionEntry[];
  brandName: string;
  brandSlug: string;
  range: number;
  pageModel: string;
}

interface NarrativeApiResponse {
  hasData: boolean;
  narrative?: NarrativeResponse;
}

interface PreviewResponse {
  id: string;
  model: string;
  responseText: string;
  date: string;
  prompt: { text: string; cluster: string | null; intent: string | null };
  analysis: unknown;
}

const SENTIMENT_ORDER = ["Negative", "Conditional", "Neutral", "Positive", "Strong"] as const;
const SENTIMENT_X: Record<string, number> = {
  Negative: 0,
  Conditional: 1,
  Neutral: 2,
  Positive: 3,
  Strong: 4,
};
const SENTIMENT_COLOR: Record<string, string> = {
  Strong: "hsl(162, 63%, 30%)",
  Positive: "hsl(168, 55%, 48%)",
  Neutral: "hsl(218, 11%, 72%)",
  Conditional: "hsl(38, 92%, 55%)",
  Negative: "hsl(0, 72%, 55%)",
};

const SENTIMENT_BADGE_STYLES: Record<string, string> = {
  Strong: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  Positive: "bg-teal-100 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400",
  Neutral: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Conditional: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  Negative: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
};

function firstWords(s: string, n: number) {
  const trimmed = s.trim();
  const words = trimmed.split(/\s+/);
  const result = words.length <= n ? trimmed : words.slice(0, n).join(" ") + "…";
  return result.length > 22 ? result.slice(0, 20) + "…" : result;
}

/** Candidate positions for a label relative to its dot (px offsets). */
const CANDIDATES = [
  { dx: 16, dy: -2, anchor: "start" },    // right
  { dx: 0, dy: -20, anchor: "middle" },   // top
  { dx: 0, dy: 28, anchor: "middle" },    // bottom
  { dx: -16, dy: -2, anchor: "end" },     // left
  { dx: 16, dy: -20, anchor: "start" },   // top-right
  { dx: -16, dy: -20, anchor: "end" },    // top-left
  { dx: 16, dy: 28, anchor: "start" },    // bottom-right
  { dx: -16, dy: 28, anchor: "end" },     // bottom-left
  { dx: 0, dy: -36, anchor: "middle" },   // far top
  { dx: 0, dy: 42, anchor: "middle" },    // far bottom
  { dx: 16, dy: -36, anchor: "start" },   // far top-right
  { dx: -16, dy: -36, anchor: "end" },    // far top-left
] as const;

const LABEL_W = 110;
const LABEL_H = 22;

type TextAnchor = "start" | "middle" | "end";

interface LabelPos {
  dx: number;
  dy: number;
  anchor: TextAnchor;
  hidden: boolean;
}

/** Check if two label bounding boxes overlap. Anchored labels need offset based on text-anchor. */
function labelRect(x: number, y: number, anchor: TextAnchor): { left: number; right: number; top: number; bottom: number } {
  const halfH = LABEL_H / 2;
  if (anchor === "start") return { left: x, right: x + LABEL_W, top: y - halfH, bottom: y + halfH };
  if (anchor === "end") return { left: x - LABEL_W, right: x, top: y - halfH, bottom: y + halfH };
  return { left: x - LABEL_W / 2, right: x + LABEL_W / 2, top: y - halfH, bottom: y + halfH };
}

function rectsOverlap(a: ReturnType<typeof labelRect>, b: ReturnType<typeof labelRect>): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function resolveLabels(
  points: { cx: number; cy: number }[],
  chartBounds?: { left: number; right: number; top: number; bottom: number },
): LabelPos[] {
  const placed: { rect: ReturnType<typeof labelRect> }[] = [];
  const result: LabelPos[] = [];

  // Also treat each dot center as a placed obstacle so labels don't overlap dots
  const dotObstacles = points.map((pt) => ({
    rect: { left: pt.cx - 10, right: pt.cx + 10, top: pt.cy - 10, bottom: pt.cy + 10 },
  }));

  for (const pt of points) {
    let bestCandidate: LabelPos = { dx: CANDIDATES[0].dx, dy: CANDIDATES[0].dy, anchor: CANDIDATES[0].anchor, hidden: false };
    let bestOverlaps = Infinity;

    for (const c of CANDIDATES) {
      const lx = pt.cx + c.dx;
      const ly = pt.cy + c.dy;
      const rect = labelRect(lx, ly, c.anchor);

      // Check if label would be clipped by chart boundaries
      if (chartBounds) {
        if (rect.left < chartBounds.left || rect.right > chartBounds.right ||
            rect.top < chartBounds.top || rect.bottom > chartBounds.bottom) {
          continue;
        }
      }

      let overlaps = 0;
      for (const p of placed) {
        if (rectsOverlap(rect, p.rect)) overlaps++;
      }
      // Check overlap with other dots (not our own)
      for (let j = 0; j < dotObstacles.length; j++) {
        if (points[j] === pt) continue;
        if (rectsOverlap(rect, dotObstacles[j].rect)) overlaps++;
      }
      if (overlaps < bestOverlaps) {
        bestOverlaps = overlaps;
        bestCandidate = { dx: c.dx, dy: c.dy, anchor: c.anchor, hidden: false };
        if (overlaps === 0) break;
      }
    }

    // If no overlap-free position found, hide this label
    if (bestOverlaps > 0) {
      bestCandidate.hidden = true;
    }

    const lx = pt.cx + bestCandidate.dx;
    const ly = pt.cy + bestCandidate.dy;
    if (!bestCandidate.hidden) {
      placed.push({ rect: labelRect(lx, ly, bestCandidate.anchor) });
    }
    result.push(bestCandidate);
  }

  return result;
}

interface PointMeta {
  siblingIndex: number;
  siblingCount: number;
}

function assignPointMeta(points: { x: number; y: number }[]): PointMeta[] {
  const counts = new Map<string, number>();
  for (const p of points) {
    const key = `${p.x}|${p.y}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return points.map((p) => {
    const key = `${p.x}|${p.y}`;
    const idx = seen.get(key) ?? 0;
    seen.set(key, idx + 1);
    return { siblingIndex: idx, siblingCount: counts.get(key)! };
  });
}

export function SentimentByQuestion({ data: initialData, brandName, brandSlug, range, pageModel }: SentimentByQuestionProps) {
  const [model, setModel] = useState(pageModel);
  const { openResponse } = useResponseDetail(brandSlug);

  // Preview panel state
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [selectedSentiment, setSelectedSentiment] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, PreviewResponse[]>>({});
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  // Fetch own data when model differs from page model
  const fetchUrl = model !== pageModel
    ? `/api/narrative?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`
    : null;
  const { data: apiData, loading } = useCachedFetch<NarrativeApiResponse>(fetchUrl);

  const data = model !== pageModel && apiData?.narrative?.sentimentByQuestion
    ? apiData.narrative.sentimentByQuestion
    : initialData;

  const noData = model !== pageModel && apiData && (!apiData.hasData || !apiData.narrative?.sentimentByQuestion?.length);

  const chartData = useMemo(() => {
    // Deduplicate by prompt: average sentimentScore and consistency across entries
    const byPrompt = new Map<string, { scores: number[]; consistencies: number[]; mentions: number[]; mentionRates: number[]; first: (typeof data)[number] }>();
    for (const d of data) {
      const existing = byPrompt.get(d.prompt);
      if (existing) {
        existing.scores.push(d.sentimentScore);
        existing.consistencies.push(d.consistency);
        existing.mentions.push(d.mentions);
        existing.mentionRates.push(d.mentionRate);
      } else {
        byPrompt.set(d.prompt, {
          scores: [d.sentimentScore],
          consistencies: [d.consistency],
          mentions: [d.mentions],
          mentionRates: [d.mentionRate],
          first: d,
        });
      }
    }

    const deduped = [...byPrompt.values()].map(({ scores, consistencies, mentions, mentionRates, first }) => {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const avgConsistency = Math.round(consistencies.reduce((a, b) => a + b, 0) / consistencies.length);
      // Use the API-computed sentiment label (already uses label-count methodology
      // consistent with "How Each AI Platform Sees [Brand]")
      return {
        ...first,
        sentiment: first.sentiment,
        sentimentScore: Math.round(avgScore * 100) / 100,
        consistency: avgConsistency,
        mentions: Math.round(mentions.reduce((a, b) => a + b, 0) / mentions.length),
        mentionRate: Math.round(mentionRates.reduce((a, b) => a + b, 0) / mentionRates.length),
      };
    });

    // Assign sibling info for jitter before returning
    const raw = deduped.map((d) => ({
      ...d,
      x: SENTIMENT_X[d.sentiment] ?? 2,
      y: d.consistency,
      label: firstWords(d.prompt, 3),
      siblingIndex: 0,
      siblingCount: 1,
    }));

    // Count siblings at same x,y and assign indices for jitter
    const posMap = new Map<string, number[]>();
    raw.forEach((d, i) => {
      const key = `${d.x}|${d.y}`;
      if (!posMap.has(key)) posMap.set(key, []);
      posMap.get(key)!.push(i);
    });
    for (const indices of posMap.values()) {
      for (let j = 0; j < indices.length; j++) {
        raw[indices[j]].siblingIndex = j;
        raw[indices[j]].siblingCount = indices.length;
      }
    }

    return raw;
  }, [data]);

  // Auto-scale: find which sentiment categories are actually used and Y range
  const { xDomain, xTicks, yDomain, yTicks } = useMemo(() => {
    if (chartData.length === 0) {
      return { xDomain: [-0.5, 4.5] as [number, number], xTicks: [0, 1, 2, 3, 4], yDomain: [0, 100] as [number, number], yTicks: [0, 25, 50, 75, 100] };
    }
    const xVals = chartData.map((d) => d.x);
    const yVals = chartData.map((d) => d.y);
    const xMin = Math.min(...xVals);
    const xMax = Math.max(...xVals);
    const yMin = Math.min(...yVals);
    const yMax = Math.max(...yVals);

    // X: show categories from (min-1) to (max+1), clamped to 0-4
    const xLo = Math.max(0, xMin - 1);
    const xHi = Math.min(4, xMax + 1);
    const ticks: number[] = [];
    for (let i = xLo; i <= xHi; i++) ticks.push(i);

    // Y: pad 10% below/above, round to nearest 5, cap at 100% (max possible value)
    const yPad = Math.max((yMax - yMin) * 0.15, 10);
    const yLo = Math.max(0, Math.floor((yMin - yPad) / 5) * 5);
    const yHi = Math.min(100, Math.ceil((yMax + yPad) / 5) * 5);
    const yStep = Math.max(5, Math.round((yHi - yLo) / 4 / 5) * 5);
    const yt: number[] = [];
    for (let v = yLo; v <= yHi; v += yStep) yt.push(v);
    if (yt[yt.length - 1] < yHi) yt.push(yHi);

    return {
      xDomain: [xLo - 0.5, xHi + 0.5] as [number, number],
      xTicks: ticks,
      yDomain: [yLo, yHi] as [number, number],
      yTicks: yt,
    };
  }, [chartData]);

  // Generate insight takeaway
  const insightText = useMemo(() => {
    if (chartData.length === 0) return null;
    const strongPositive = chartData.filter((d) => d.sentiment === "Strong" || d.sentiment === "Positive");
    const negative = chartData.filter((d) => d.sentiment === "Negative" || d.sentiment === "Conditional");
    const highAgreement = chartData.filter((d) => d.consistency >= 75);

    if (strongPositive.length > 0 && negative.length === 0) {
      const best = strongPositive.sort((a, b) => b.consistency - a.consistency)[0];
      return `All questions get positive-to-strong responses — "${firstWords(best.prompt, 6)}" has the highest agreement at ${best.consistency}%.`;
    }
    if (strongPositive.length > 0 && negative.length > 0) {
      const best = strongPositive.sort((a, b) => b.consistency - a.consistency)[0];
      return `${strongPositive.length} question${strongPositive.length > 1 ? "s" : ""} trigger${strongPositive.length === 1 ? "s" : ""} positive responses while ${negative.length} get cautious or negative reactions. "${firstWords(best.prompt, 6)}" stands out as the strongest positive signal.`;
    }
    if (highAgreement.length > 0) {
      return `${highAgreement.length} of ${chartData.length} questions show high platform agreement (75%+), suggesting AI models largely converge on these topics.`;
    }
    return null;
  }, [chartData]);

  // Collect pixel positions from shape renders for the HTML click overlay
  const pixelRef = useRef<{ cx: number; cy: number; idx: number }[]>([]);
  const [labelPositions, setLabelPositions] = useState<LabelPos[]>([]);
  const [dotPixels, setDotPixels] = useState<{ cx: number; cy: number; prompt: string; sentiment: string }[]>([]);
  const renderCountRef = useRef(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Reset pixel collection each render cycle
  useEffect(() => {
    pixelRef.current = [];
    renderCountRef.current = 0;
  });

  const handleDotClick = useCallback(async (prompt: string, sentiment: string) => {
    if (selectedPrompt === prompt) {
      setSelectedPrompt(null);
      setSelectedSentiment(null);
      return;
    }

    setSelectedPrompt(prompt);
    setSelectedSentiment(sentiment);

    if (!previewData[prompt]) {
      setPreviewLoading(prompt);
      try {
        const params = new URLSearchParams({ brandSlug, promptText: prompt, scopeMode: "content" });
        if (model !== "all") params.set("model", model);
        const res = await fetch(`/api/response-detail?${params}`);
        if (res.ok) {
          const json = await res.json();
          setPreviewData((prev) => ({ ...prev, [prompt]: json.responses ?? [] }));
        }
      } finally {
        setPreviewLoading(null);
      }
    }
  }, [brandSlug, model, selectedPrompt, previewData]);

  // Tooltip state managed manually to coexist with click overlay
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length === 0 && !loading && !noData) return null;

  const previews = selectedPrompt ? (previewData[selectedPrompt] ?? []) : [];
  const isLoadingPreviews = previewLoading === selectedPrompt;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-semibold">Which Questions Trigger Positive vs Negative AI Responses</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Click any dot to preview responses, then click a response to view the full answer
          </p>
          {insightText && (
            <p className="text-xs text-muted-foreground/80 mt-1.5 italic leading-relaxed max-w-[600px]">
              {insightText}
            </p>
          )}
        </div>

        {/* Model selector */}
        <select
          value={model}
          onChange={(e) => { setModel(e.target.value); setSelectedPrompt(null); setSelectedSentiment(null); }}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
        >
          <option value="all">All Models</option>
          {VALID_MODELS.map((m) => (
            <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
          ))}
        </select>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground py-8">Loading...</p>
      )}

      {!loading && noData && (
        <p className="text-sm text-muted-foreground py-4">No sentiment data for {MODEL_LABELS[model] ?? model}.</p>
      )}

      {!loading && data.length === 0 && !noData && (
        <p className="text-sm text-muted-foreground py-4">No data available.</p>
      )}

      {!loading && data.length > 0 && (<>
      {/* Sentiment color legend */}
      <div className="flex items-center gap-4 mt-3 mb-2 text-xs text-muted-foreground">
        <span className="font-medium">Sentiment:</span>
        {SENTIMENT_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SENTIMENT_COLOR[s] }}
            />
            {s}
          </span>
        ))}
      </div>

      {/* Chart with HTML click overlay */}
      <div className="mt-2 relative" ref={chartContainerRef}>
        <ResponsiveContainer width="100%" height={440}>
          <ScatterChart margin={{ top: 48, right: 60, bottom: 40, left: 36 }}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} />
            <XAxis
              type="number"
              dataKey="x"
              domain={xDomain}
              ticks={xTicks}
              tickFormatter={(v) => SENTIMENT_ORDER[v] ?? ""}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            >
              <Label value="← More Negative          Sentiment          More Positive →" position="bottom" offset={16} fontSize={11} fill="var(--muted-foreground)" />
            </XAxis>
            <YAxis
              type="number"
              dataKey="y"
              domain={yDomain}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              ticks={yTicks}
              tickFormatter={(v) => `${v}%`}
            >
              <Label value="Platform Agreement (%)" angle={-90} position="center" dx={-28} fontSize={11} fill="var(--muted-foreground)" />
            </YAxis>
            {/* Tooltip disabled — we use our own HTML tooltip via hover overlay */}
            <Tooltip content={() => null} cursor={false} />
            <Scatter
              data={chartData}
              isAnimationActive={false}
              shape={((props: { cx: number; cy: number; payload: (typeof chartData)[number]; index: number }) => {
                const { cx: rawCx, cy: rawCy, payload, index } = props;
                const fill = SENTIMENT_COLOR[payload.sentiment] ?? "hsl(218, 11%, 72%)";
                const isSelected = selectedPrompt === payload.prompt;
                const hasOverlap = payload.siblingCount > 1;
                const r = isSelected ? 8 : hasOverlap && payload.siblingCount > 3 ? 5.5 : 6.5;

                // Apply jitter for overlapping dots — spread horizontally + slight vertical offset
                let cx = rawCx;
                let cy = rawCy;
                if (hasOverlap) {
                  const spread = 20; // px between dots
                  const totalWidth = (payload.siblingCount - 1) * spread;
                  cx = rawCx - totalWidth / 2 + payload.siblingIndex * spread;
                  // Alternate slight vertical offset for dense clusters
                  if (payload.siblingCount > 4) {
                    cy = rawCy + (payload.siblingIndex % 2 === 0 ? -6 : 6);
                  }
                }

                // Collect pixel positions; resolve labels + dot positions once all rendered
                pixelRef.current[index] = { cx, cy, idx: index };
                renderCountRef.current++;
                if (renderCountRef.current === chartData.length) {
                  const sorted = [...pixelRef.current].sort((a, b) => a.idx - b.idx);
                  const containerEl = chartContainerRef.current;
                  const bounds = containerEl
                    ? { left: 36, right: containerEl.offsetWidth - 60, top: 10, bottom: 440 - 40 }
                    : undefined;
                  const resolved = resolveLabels(sorted, bounds);
                  setTimeout(() => {
                    setLabelPositions(resolved);
                    setDotPixels(sorted.map((p, i) => ({
                      cx: p.cx,
                      cy: p.cy,
                      prompt: chartData[i].prompt,
                      sentiment: chartData[i].sentiment,
                    })));
                  }, 0);
                }

                return (
                  <g>
                    {isSelected && (
                      <circle cx={cx} cy={cy} r={r + 4} fill={fill} opacity={0.2} />
                    )}
                    <circle cx={cx} cy={cy} r={r} fill={fill} stroke={isSelected ? "var(--foreground)" : "none"} strokeWidth={isSelected ? 2 : 0} />
                  </g>
                );
              }) as unknown as undefined}
            />
            {/* Labels layer */}
            <Customized
              component={() => {
                if (labelPositions.length !== chartData.length) return null;
                return (
                  <g>
                    {chartData.map((d, i) => {
                      const px = pixelRef.current[i];
                      if (!px) return null;
                      const lp = labelPositions[i];
                      if (lp.hidden) return null;
                      const textX = px.cx + lp.dx;
                      const textY = px.cy + lp.dy;
                      return (
                        <g key={i}>
                          <text
                            x={textX}
                            y={textY}
                            textAnchor={lp.anchor}
                            fontSize={10}
                            fill="var(--card)"
                            stroke="var(--card)"
                            strokeWidth={3}
                            paintOrder="stroke"
                          >
                            {d.label}
                          </text>
                          <text
                            x={textX}
                            y={textY}
                            textAnchor={lp.anchor}
                            fontSize={10}
                            fill="var(--muted-foreground)"
                          >
                            {d.label}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>

        {/* HTML click + hover overlay — positioned absolutely on top of the chart */}
        {dotPixels.length > 0 && (
          <div
            className="absolute inset-0"
            onMouseMove={(e) => {
              // Find the closest dot to the mouse position within 20px
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = e.clientX - rect.left;
              const my = e.clientY - rect.top;
              let closest = -1;
              let closestDist = 20; // max distance threshold in px
              for (let i = 0; i < dotPixels.length; i++) {
                const dx = mx - dotPixels[i].cx;
                const dy = my - dotPixels[i].cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < closestDist) {
                  closestDist = dist;
                  closest = i;
                }
              }
              setHoveredIdx(closest >= 0 ? closest : null);
            }}
            onMouseLeave={() => setHoveredIdx(null)}
            onClick={(e) => {
              // Find the closest dot to the click position within 20px
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = e.clientX - rect.left;
              const my = e.clientY - rect.top;
              let closest = -1;
              let closestDist = 20;
              for (let i = 0; i < dotPixels.length; i++) {
                const dx = mx - dotPixels[i].cx;
                const dy = my - dotPixels[i].cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < closestDist) {
                  closestDist = dist;
                  closest = i;
                }
              }
              if (closest >= 0) {
                handleDotClick(dotPixels[closest].prompt, dotPixels[closest].sentiment);
              } else if (selectedPrompt) {
                // Clicked empty space — close the preview panel
                setSelectedPrompt(null);
                setSelectedSentiment(null);
              }
            }}
            style={{ cursor: hoveredIdx !== null ? "pointer" : undefined }}
          >
            {/* Custom HTML tooltip on hover */}
            {hoveredIdx !== null && dotPixels[hoveredIdx] && (
              <div
                className="absolute z-50 rounded-lg border border-border bg-popover p-3 shadow-md text-xs space-y-1 w-64"
                style={{
                  left: Math.min(dotPixels[hoveredIdx].cx + 16, (chartContainerRef.current?.offsetWidth ?? 800) - 280),
                  top: dotPixels[hoveredIdx].cy - 10,
                  pointerEvents: "none",
                }}
              >
                <p className="font-medium text-popover-foreground">{dotPixels[hoveredIdx].prompt}</p>
                <p className="text-muted-foreground">
                  Sentiment:{" "}
                  <span className="font-medium" style={{ color: SENTIMENT_COLOR[dotPixels[hoveredIdx].sentiment] }}>
                    {dotPixels[hoveredIdx].sentiment}
                  </span>
                </p>
                {(() => {
                  const entry = data.find((d) => d.prompt === dotPixels[hoveredIdx]?.prompt);
                  return entry ? <p className="text-muted-foreground">Consistency: {entry.consistency}%</p> : null;
                })()}
                <p className="text-muted-foreground/60 text-[10px] mt-1">Click to view responses</p>
              </div>
            )}

            {/* Preview overlay — anchored inside the chart area */}
            {selectedPrompt && (() => {
              const dotIdx = dotPixels.findIndex((d) => d.prompt === selectedPrompt);
              const dot = dotIdx >= 0 ? dotPixels[dotIdx] : null;
              // Position the panel: if the dot is in the left half, show to the right; otherwise to the left
              const containerW = chartContainerRef.current?.offsetWidth ?? 800;
              const showRight = dot ? dot.cx < containerW / 2 : true;

              return (
                <div
                  className="absolute z-40 w-80 max-h-[340px] overflow-y-auto rounded-xl bg-card shadow-lg animate-in fade-in zoom-in-95 duration-150"
                  style={{
                    top: Math.max(8, (dot?.cy ?? 100) - 40),
                    ...(showRight
                      ? { left: (dot?.cx ?? 100) + 24 }
                      : { right: containerW - (dot?.cx ?? 100) + 24 }),
                    pointerEvents: "auto",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="sticky top-0 bg-card z-10 px-4 pt-3 pb-2 border-b border-border/60">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground leading-snug">{selectedPrompt}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {selectedSentiment && (
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SENTIMENT_BADGE_STYLES[selectedSentiment] ?? SENTIMENT_BADGE_STYLES.Neutral}`}>
                              {selectedSentiment}
                            </span>
                          )}
                          {(() => {
                            const entry = data.find((d) => d.prompt === selectedPrompt);
                            return entry ? (
                              <span className="text-[10px] text-muted-foreground">{entry.consistency}% consistency</span>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedPrompt(null); setSelectedSentiment(null); }}
                        className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  <div className="px-4 py-3">
                    {isLoadingPreviews ? (
                      <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading responses&hellip;
                      </div>
                    ) : previews.length === 0 ? (
                      <p className="py-3 text-xs text-muted-foreground text-center">
                        No response data available for this question.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground">Click a response to view full answer:</p>
                        {previews.map((preview) => {
                          const snippet = preview.responseText.slice(0, 140).replace(/\n+/g, " ").replace(/[*_#`~>|]+/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s{2,}/g, " ").trim();
                          return (
                            <button
                              key={preview.id}
                              className="w-full flex items-start gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors group"
                              onClick={(e) => {
                                e.stopPropagation();
                                openResponse({ promptText: selectedPrompt, model: preview.model, brandName, scopeMode: "content" });
                              }}
                            >
                              <div className="shrink-0 mt-0.5">
                                <span className="inline-block rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground whitespace-nowrap">
                                  {MODEL_LABELS[preview.model] ?? preview.model}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-foreground line-clamp-2 leading-relaxed">
                                  {snippet}{preview.responseText.length > 140 ? "\u2026" : ""}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{preview.date}</p>
                              </div>
                              <ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
      </>)}
    </section>
  );
}
