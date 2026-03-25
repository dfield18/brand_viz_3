"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import type { CompetitorNarrative, CompetitorRow } from "@/types/api";

interface CompetitorFrameBreakdownProps {
  narratives: CompetitorNarrative[];
  competitors: CompetitorRow[];
  brandName: string;
  selectedEntity?: string;
  onEntityChange?: (entityId: string) => void;
}

const BAR_COLORS = [
  "var(--chart-3)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const MAX_RADAR_LABELS = 6;
const MIN_RADAR_LABELS = 4;

function wrapLabel(text: string, maxChars = 14): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  // Truncate to max 2 lines with ellipsis
  if (lines.length > 2) {
    return [lines[0], lines[1].length > maxChars - 1 ? lines[1].slice(0, maxChars - 1) + "…" : lines[1] + "…"];
  }
  return lines;
}

function RadarTickLabel(props: {
  x?: number; y?: number; payload?: { value: string };
  cx?: number; cy?: number;
}) {
  const { x = 0, y = 0, payload, cx = 0, cy = 0 } = props;
  const label = payload?.value ?? "";
  const lines = wrapLabel(label, 14);
  const dx = x - cx;
  const dy = y - cy;
  const anchor = dx > 5 ? "start" : dx < -5 ? "end" : "middle";
  const nudgeX = dx > 5 ? 6 : dx < -5 ? -6 : 0;
  const nudgeY = dy > 5 ? 6 : dy < -5 ? -6 : 0;

  return (
    <g transform={`translate(${x + nudgeX},${y + nudgeY})`}>
      <title>{label}</title>
      {lines.map((line, i) => (
        <text
          key={i}
          x={0}
          y={i * 12}
          dy={y < cy ? -((lines.length - 1) * 12) + 4 : 4}
          textAnchor={anchor}
          fontSize={10}
          fill="var(--muted-foreground)"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

export function useDefaultCompetitorEntity(narratives: CompetitorNarrative[], competitors: CompetitorRow[]) {
  return useMemo(() => {
    const nonBrand = competitors
      .filter((c) => !c.isBrand)
      .sort((a, b) => b.mentionRate - a.mentionRate);
    const topCompetitor = nonBrand[0];
    if (topCompetitor) {
      const hasNarrative = narratives.find((n) => n.entityId === topCompetitor.entityId && n.themes.length > 0);
      if (hasNarrative) return topCompetitor.entityId;
    }
    const first = narratives.find((n) => n.themes.length > 0);
    return first?.entityId ?? narratives[0]?.entityId ?? "";
  }, [narratives, competitors]);
}

export function CompetitorEntityDropdown({
  narratives,
  competitors,
  selectedEntity,
  onEntityChange,
}: {
  narratives: CompetitorNarrative[];
  competitors: CompetitorRow[];
  selectedEntity: string;
  onEntityChange: (entityId: string) => void;
}) {
  const availableNarratives = useMemo(() => narratives.filter((n) => n.themes.length > 0), [narratives]);
  return (
    <select
      value={selectedEntity}
      onChange={(e) => onEntityChange(e.target.value)}
      className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0 min-w-[240px]"
    >
      {availableNarratives.map((n) => {
        const comp = competitors.find((c) => c.entityId === n.entityId);
        return (
          <option key={n.entityId} value={n.entityId}>
            {n.name}{comp ? ` (mentioned in ${comp.mentionRate}% of AI answers)` : ""}
          </option>
        );
      })}
    </select>
  );
}

export function CompetitorFrameBreakdown({ narratives, competitors, brandName, selectedEntity: externalEntity, onEntityChange }: CompetitorFrameBreakdownProps) {
  // Default to competitor with highest brand recall (mentionRate), excluding the brand itself
  const defaultEntityId = useDefaultCompetitorEntity(narratives, competitors);

  const [internalEntity, setInternalEntity] = useState(defaultEntityId);
  const selectedEntity = externalEntity ?? internalEntity;
  const setSelectedEntity = onEntityChange ?? setInternalEntity;

  // Filter narratives that have theme data for the dropdown
  const availableNarratives = useMemo(() => {
    return narratives.filter((n) => n.themes.length > 0);
  }, [narratives]);

  const selectedNarrative = availableNarratives.find((n) => n.entityId === selectedEntity);

  if (availableNarratives.length === 0 || !selectedNarrative) {
    return null;
  }

  const allData = selectedNarrative.themes.map((t) => ({
    frame: t.label,
    percentage: t.pct,
  }));

  // Bar chart shows all themes; radar chart shows top 4–6 for readability
  const data = allData;
  const radarData = allData.slice(0, Math.max(MIN_RADAR_LABELS, Math.min(MAX_RADAR_LABELS, allData.length)));

  // Scale bar size and spacing based on frame count so few-frame charts don't look cramped
  const rowHeight = data.length <= 3 ? 64 : data.length <= 5 ? 50 : 38;
  const barHeight = data.length <= 3 ? 28 : data.length <= 5 ? 22 : 18;
  const chartHeight = Math.max(data.length * rowHeight + 20, 220);
  // Radar height matches bar chart height (with room for heading text)
  const radarHeight = Math.max(chartHeight, 240);

  return (
    <div>

      <div className="grid grid-cols-1 lg:grid-cols-[5fr_4fr] gap-6 items-start mt-8">
        {/* Left: horizontal bar chart */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Frame Distribution for {selectedNarrative.name}
          </h3>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, "auto"]}
                tickFormatter={(v) => `${v}%`}
                fontSize={11}
                height={20}
              />
              <YAxis
                type="category"
                dataKey="frame"
                width={130}
                fontSize={11}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { frame: string } | undefined;
                  if (!d) return null;
                  const value = payload[0]?.value;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
                      <p className="font-medium text-foreground mb-0.5">{d.frame}</p>
                      <p className="text-muted-foreground">{value}% of mentions</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="percentage" radius={[0, 4, 4, 0]} barSize={barHeight}>
                {data.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Right: radar chart */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            Narrative Profile
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Larger area = AI leans more heavily on this narrative for {selectedNarrative.name}
          </p>
          <ResponsiveContainer width="100%" height={radarHeight}>
            <RadarChart cx="50%" cy="50%" outerRadius="42%" data={radarData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey="frame"
                tick={(props: object) => <RadarTickLabel {...props as Parameters<typeof RadarTickLabel>[0]} />}
              />
              <PolarRadiusAxis
                domain={[0, "auto"]}
                tick={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { frame: string } | undefined;
                  if (!d) return null;
                  const value = payload[0]?.value;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
                      <p className="font-medium text-foreground mb-0.5">{d.frame}</p>
                      <p className="text-muted-foreground">{selectedNarrative.name}: {value ?? 0}%</p>
                    </div>
                  );
                }}
              />
              <Radar
                dataKey="percentage"
                name={selectedNarrative.name}
                stroke="var(--chart-3)"
                fill="var(--chart-3)"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Narrative frames are detected using keyword and theme analysis of AI responses mentioning this competitor. Percentages show how frequently each frame appears relative to other frames.
      </p>
    </div>
  );
}
