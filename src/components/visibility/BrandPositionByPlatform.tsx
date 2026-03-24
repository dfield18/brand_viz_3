"use client";

import { useState, useMemo } from "react";
import type { PromptPosition, ModelBreakdownRow } from "@/types/api";
import { useResponseDetail } from "@/lib/useResponseDetail";

interface BrandPositionByPlatformProps {
  promptPositions: PromptPosition[];
  modelBreakdown: ModelBreakdownRow[];
  brandSlug?: string;
  brandName?: string;
  /** Render without card wrapper */
  inline?: boolean;
  /** Externally controlled model filter — hides the prompt dropdown when set */
  externalModel?: string;
}

const POSITION_BUCKETS = [
  { label: "#1", min: 1, max: 1 },
  { label: "2–3", min: 2, max: 3 },
  { label: "4–5", min: 4, max: 5 },
  { label: "6+", min: 6, max: Infinity },
  { label: "Not Listed", min: -1, max: -1 },
] as const;

const MODEL_ORDER = ["chatgpt", "gemini", "claude", "perplexity", "google"] as const;

const MODEL_CONFIG: Record<string, { label: string; iconColor: string }> = {
  chatgpt: { label: "OpenAI GPT-4o", iconColor: "#10a37f" },
  gemini: { label: "Google Gemini", iconColor: "#4285f4" },
  claude: { label: "Anthropic Claude", iconColor: "#d97706" },
  perplexity: { label: "Perplexity Sonar", iconColor: "#7c3aed" },
  google: { label: "Google AI Overview", iconColor: "#ea4335" },
};

function ModelIcon({ model, size = 16 }: { model: string; size?: number }) {
  const color = MODEL_CONFIG[model]?.iconColor ?? "#6b7280";
  switch (model) {
    case "chatgpt":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M22.28 9.37a5.93 5.93 0 0 0-.51-4.89 6.01 6.01 0 0 0-6.48-2.88A5.93 5.93 0 0 0 10.8.24a6.01 6.01 0 0 0-5.73 4.15A5.93 5.93 0 0 0 1.1 7.36a6.01 6.01 0 0 0 .74 7.27 5.93 5.93 0 0 0 .51 4.89 6.01 6.01 0 0 0 6.48 2.88A5.93 5.93 0 0 0 13.2 23.76a6.01 6.01 0 0 0 5.73-4.15 5.93 5.93 0 0 0 3.97-2.97 6.01 6.01 0 0 0-.74-7.27h.12ZM13.2 22.18a4.45 4.45 0 0 1-2.85-1.03l.14-.08 4.73-2.73a.77.77 0 0 0 .39-.67v-6.67l2 1.15a.07.07 0 0 1 .04.05v5.52a4.47 4.47 0 0 1-4.45 4.46ZM3.6 18.13a4.43 4.43 0 0 1-.53-2.99l.14.08 4.73 2.73a.77.77 0 0 0 .77 0l5.78-3.34v2.31a.07.07 0 0 1-.03.06l-4.79 2.76a4.47 4.47 0 0 1-6.07-1.61ZM2.34 7.9a4.43 4.43 0 0 1 2.32-1.95v5.62a.77.77 0 0 0 .38.67l5.78 3.34-2 1.15a.07.07 0 0 1-.07 0L4.02 14a4.47 4.47 0 0 1-1.68-6.1Zm17.15 3.99-5.78-3.34 2-1.15a.07.07 0 0 1 .07 0l4.73 2.73a4.47 4.47 0 0 1-.69 8.06v-5.62a.77.77 0 0 0-.38-.67h.05ZM21.54 8.85l-.14-.08-4.73-2.73a.77.77 0 0 0-.77 0l-5.78 3.34V7.07a.07.07 0 0 1 .03-.06l4.79-2.76a4.47 4.47 0 0 1 6.6 4.6ZM7.33 13.34l-2-1.15a.07.07 0 0 1-.04-.06V6.62a4.47 4.47 0 0 1 7.32-3.43l-.14.08-4.73 2.73a.77.77 0 0 0-.39.67l-.02 6.67Zm1.09-2.34L12 8.93l3.58 2.07v4.13L12 17.2l-3.58-2.07V11Z" fill={color}/>
        </svg>
      );
    case "gemini":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 24C12 18.84 8.16 14.52 3 13.5v-3C8.16 9.48 12 5.16 12 0c0 5.16 3.84 9.48 9 10.5v3c-5.16 1.02-9 5.34-9 10.5Z" fill={color}/>
        </svg>
      );
    case "claude":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M15.31 3.84 8.89 21h-2.2L13.11 3.84h2.2Zm-4.16 8.16L6.58 21H4.39l3.42-6.68 3.34-2.32Zm2.7 0L17.19 21h2.2l-3.42-6.68-2.12-2.32Zm1.46-5.16L12 11.52 8.69 6.84h2.2L12 8.52l1.11-1.68h2.2Z" fill={color}/>
        </svg>
      );
    case "perplexity":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 1.5 5.25 7.5v4.25H2.5v8.75h5.75V24h7.5v-3.5h5.75v-8.75h-2.75V7.5L12 1.5Zm0 3.04 3.75 3.46H8.25L12 4.54ZM6.75 9h4.5v3.75H6.75V9Zm10.5 0v3.75h-4.5V9h4.5ZM4 13.25h7.25v5.5H8.25v-3h-1.5v3H4v-5.5Zm8.75 0H20v5.5h-2.75v-3h-1.5v3h-3V13.25Z" fill={color}/>
        </svg>
      );
    default:
      return <div className="w-4 h-4 rounded-full bg-muted" />;
  }
}

function bucketFor(position: number | null): number {
  if (position === null) return 4; // Not Mentioned
  if (position === 1) return 0;
  if (position <= 3) return 1;
  if (position <= 5) return 2;
  return 3; // 6+
}

export function BrandPositionByPlatform({ promptPositions, modelBreakdown, brandSlug, brandName, inline, externalModel }: BrandPositionByPlatformProps) {
  const { openResponse } = useResponseDetail(brandSlug ?? "");
  const [focusPrompt, setFocusPrompt] = useState("all");

  const availablePrompts = useMemo(() => {
    return [...new Set(promptPositions.map((p) => p.promptText))].sort();
  }, [promptPositions]);

  const filteredPositions = useMemo(() => {
    if (focusPrompt === "all") return promptPositions;
    return promptPositions.filter((p) => p.promptText === focusPrompt);
  }, [promptPositions, focusPrompt]);

  const chartData = useMemo(() => {
    let models = MODEL_ORDER.filter((m) =>
      modelBreakdown.some((mb) => mb.model === m && mb.totalRuns > 0)
    );
    if (externalModel && externalModel !== "all") {
      models = models.filter((m) => m === externalModel);
    }

    return models.map((model) => {
      const prompts = filteredPositions.filter((p) => p.model === model);

      // Group prompts into buckets
      const buckets: { promptText: string; position: number | null }[][] = [[], [], [], [], []];
      for (const p of prompts) {
        buckets[bucketFor(p.position)].push({ promptText: p.promptText, position: p.position });
      }

      return { model, buckets };
    });
  }, [filteredPositions, modelBreakdown, externalModel]);

  if (chartData.length === 0) return null;

  const Wrapper = inline ? "div" : "section";

  return (
    <Wrapper className={inline ? "" : "rounded-xl bg-card p-6 shadow-section mt-6"}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className={inline ? "text-sm font-medium text-foreground" : "text-base font-semibold"}>Where AI Ranks {brandName || "This Brand"}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Each dot is one AI response — click to read the full answer
          </p>
        </div>
        {!externalModel && availablePrompts.length > 0 && (
          <select
            value={focusPrompt}
            onChange={(e) => setFocusPrompt(e.target.value)}
            className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card max-w-[260px] truncate shrink-0 ml-4"
          >
            <option value="all">All Questions</option>
            {availablePrompts.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
      </div>

      {/* Chart */}
      <div className="overflow-x-auto mt-5">
        <div className="min-w-[600px]">
          {/* Column headers */}
          <div
            className="grid items-end pb-3 border-b border-border text-xs font-medium text-muted-foreground"
            style={{ gridTemplateColumns: "160px repeat(5, 1fr)" }}
          >
            <div />
            {POSITION_BUCKETS.map((b) => (
              <div key={b.label} className="text-center">{b.label}</div>
            ))}
          </div>

          {/* Rows */}
          {chartData.map(({ model, buckets }) => {
            const config = MODEL_CONFIG[model];
            return (
              <div
                key={model}
                className="grid items-center py-5 border-b border-border/30 last:border-0"
                style={{ gridTemplateColumns: "160px repeat(5, 1fr)" }}
              >
                <div className="flex items-center gap-2">
                  <ModelIcon model={model} />
                  <span className="text-sm font-medium text-foreground truncate">
                    {config?.label ?? model}
                  </span>
                </div>
                {buckets.map((items, bucketIdx) => (
                  <div key={bucketIdx} className="flex flex-wrap justify-center gap-1 px-1">
                    {items.length > 0 ? (
                      items.map((item, i) => (
                        <div
                          key={i}
                          className={`w-3.5 h-3.5 rounded-full transition-all ${
                            brandSlug ? "cursor-pointer hover:scale-125 hover:ring-2 hover:ring-offset-1 hover:ring-current" : ""
                          }`}
                          style={{
                            backgroundColor: item.position === null
                              ? "#d1d5db"
                              : config?.iconColor ?? "#6b7280",
                          }}
                          title={item.promptText}
                          onClick={
                            brandSlug
                              ? () => openResponse({ promptText: item.promptText, model, brandName, scopeMode: "query_universe" })
                              : undefined
                          }
                        />
                      ))
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

        </div>
      </div>
    </Wrapper>
  );
}
