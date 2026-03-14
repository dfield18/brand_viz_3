"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DomainOverTimeEntry, SourcesResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS, VALID_CLUSTERS, CLUSTER_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface Props {
  data: DomainOverTimeEntry[];
  brandSlug: string;
  range: number;
  pageModel: string;
}

interface ApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

const DOMAIN_COLORS = [
  "hsl(217, 91%, 50%)",
  "hsl(0, 72%, 55%)",
  "hsl(160, 60%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(263, 70%, 55%)",
  "hsl(330, 80%, 55%)",
  "hsl(187, 72%, 45%)",
  "hsl(24, 95%, 53%)",
];

const MODEL_KEYS = ["chatgpt", "gemini", "claude", "perplexity", "google"] as const;

const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0";

export default function SourceCategoryOverTime({ data: initialData, brandSlug, range, pageModel }: Props) {
  const [selectedModel, setSelectedModel] = useState("all");
  const [cluster, setCluster] = useState("all");

  const needsFetch = cluster !== "all";
  const url = needsFetch
    ? `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${pageModel}&range=${range}&cluster=${cluster}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const data = needsFetch && apiData?.sources?.domainOverTime
    ? apiData.sources.domainOverTime
    : needsFetch && apiData && !apiData.sources
    ? []
    : initialData;

  const models = useMemo(() => {
    const set = new Set(data.map((d) => d.model));
    return MODEL_KEYS.filter((m) => set.has(m));
  }, [data]);

  // Filter to selected model, find top domains, build chart data
  const { chartData, topDomains } = useMemo(() => {
    const filtered = data.filter((d) => d.model === selectedModel);

    // Sum totals per domain across all time points
    const domainTotals: Record<string, number> = {};
    for (const entry of filtered) {
      for (const key of Object.keys(entry)) {
        if (key !== "date" && key !== "model") {
          domainTotals[key] = (domainTotals[key] ?? 0) + Number(entry[key] ?? 0);
        }
      }
    }

    // Pick top 8 domains by total citations
    const sorted = Object.entries(domainTotals)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);
    const domains = sorted.slice(0, 8).map(([k]) => k);

    // Build chart rows with all top domains
    const filled = filtered.map((entry) => {
      const row: Record<string, string | number> = { date: String(entry.date) };
      for (const d of domains) {
        row[d] = Number(entry[d]) || 0;
      }
      return row;
    });

    return { chartData: filled, topDomains: domains };
  }, [data, selectedModel]);

  if (!loading && data.length === 0 && initialData.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-semibold">Top Source Trends</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How the most-cited sources are trending over time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={cluster} onChange={(e) => setCluster(e.target.value)} className={selectClass}>
            {Object.entries(CLUSTER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className={selectClass}>
            <option value="all">All AI Platforms</option>
            {models.map((m) => (
              <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      )}

      {!loading && chartData.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No source trend data for this selection.</p>
        </div>
      )}

      {!loading && chartData.length > 0 && (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                fontSize={11}
                tickLine={false}
                tickFormatter={(d: string) => {
                  const [, m, day] = d.split("-");
                  return `${m}/${day}`;
                }}
              />
              <YAxis
                fontSize={12}
                tickLine={false}
                width={40}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const date = new Date(String(label) + "T00:00:00");
                  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  const items = [...payload].filter((p) => (p.value as number) > 0).sort((a, b) => (b.value as number) - (a.value as number));
                  return (
                    <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs space-y-1.5">
                      <p className="font-medium text-popover-foreground">{dateStr}</p>
                      {items.map((item) => (
                        <p key={item.dataKey as string} className="text-muted-foreground flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          {item.name}: <span className="font-medium text-popover-foreground">{item.value} citations</span>
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                height={44}
                wrapperStyle={{ paddingBottom: 8 }}
                formatter={(value: string) => (
                  <span style={{ fontSize: 11, marginRight: 10, color: "var(--foreground)" }}>{value}</span>
                )}
              />

              {topDomains.map((domain, i) => (
                <Line
                  key={domain}
                  type="monotone"
                  dataKey={domain}
                  name={domain}
                  stroke={DOMAIN_COLORS[i % DOMAIN_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
