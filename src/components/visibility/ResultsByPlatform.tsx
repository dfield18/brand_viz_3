"use client";

import type { ModelBreakdownRow } from "@/types/api";

interface ResultsByPlatformProps {
  rows: ModelBreakdownRow[];
  brandName: string;
}

const MODEL_CONFIG: Record<string, { label: string; gradient: string; textColor: string; iconColor: string }> = {
  chatgpt: {
    label: "OpenAI GPT-4o",
    gradient: "from-emerald-400 to-teal-500",
    textColor: "text-emerald-600",
    iconColor: "#10a37f",
  },
  gemini: {
    label: "Google Gemini",
    gradient: "from-blue-400 to-blue-600",
    textColor: "text-blue-600",
    iconColor: "#4285f4",
  },
  claude: {
    label: "Anthropic Claude",
    gradient: "from-orange-400 to-amber-500",
    textColor: "text-orange-600",
    iconColor: "#d97706",
  },
  perplexity: {
    label: "Perplexity Sonar",
    gradient: "from-violet-400 to-purple-500",
    textColor: "text-violet-600",
    iconColor: "#7c3aed",
  },
  google: {
    label: "Google AI Overview",
    gradient: "from-red-400 to-rose-500",
    textColor: "text-red-600",
    iconColor: "#ea4335",
  },
};

function ModelIcon({ model, size = 18 }: { model: string; size?: number }) {
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
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm3.5 14.5c-.55 0-1-.22-1.38-.55L12 13.83l-2.12 2.12c-.38.33-.83.55-1.38.55a2 2 0 0 1-2-2c0-.55.22-1 .55-1.38L9.17 11 7.05 8.88A1.96 1.96 0 0 1 6.5 7.5a2 2 0 0 1 2-2c.55 0 1 .22 1.38.55L12 8.17l2.12-2.12c.38-.33.83-.55 1.38-.55a2 2 0 0 1 2 2c0 .55-.22 1-.55 1.38L14.83 11l2.12 2.12c.33.38.55.83.55 1.38a2 2 0 0 1-2 2Z" fill={color}/>
        </svg>
      );
    case "perplexity":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M12 2L4 6v6l8 4 8-4V6l-8-4ZM4 18l8 4 8-4v-6l-8 4-8-4v6Z" fill={color}/>
        </svg>
      );
    default:
      return (
        <div className="w-[18px] h-[18px] rounded-full bg-muted" />
      );
  }
}

export function ResultsByPlatform({ rows, brandName }: ResultsByPlatformProps) {
  const validRows = rows.filter((r) => r.totalRuns > 0);

  if (validRows.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">Results by AI Platform</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
        {validRows.map((row) => {
          const rate = row.mentionRate ?? 0;
          const mentions = Math.round((rate / 100) * row.totalRuns);
          const topPosition = (row.firstMentionPct ?? 0) > 0 ? 1 : null;
          const config = MODEL_CONFIG[row.model];
          const colorGradient = config?.gradient ?? "from-gray-400 to-gray-500";
          const textColor = config?.textColor ?? "text-muted-foreground";

          return (
            <div
              key={row.model}
              className="rounded-lg border border-border bg-background px-5 py-4"
            >
              {/* Model name with icon */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ModelIcon model={row.model} />
                  <span className="text-sm font-semibold text-foreground">
                    {config?.label ?? row.model}
                  </span>
                </div>
              </div>

              {/* Progress bar + percentage */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${colorGradient} transition-all duration-500`}
                    style={{ width: `${rate}%` }}
                  />
                </div>
                <span className={`text-sm font-bold tabular-nums ${textColor}`}>
                  {rate}%
                </span>
              </div>

              {/* Stats row */}
              <div className="flex items-center justify-between mt-2.5 text-xs text-muted-foreground">
                <span>
                  {mentions} of {row.totalRuns} responses mention brand
                </span>
                <div className="flex items-center gap-3">
                  {topPosition !== null && (
                    <span>
                      top position: <span className="font-semibold text-foreground">#{topPosition}</span>
                    </span>
                  )}
                  {row.avgRank !== null && (
                    <span>
                      avg position: <span className="font-semibold text-foreground">#{row.avgRank.toFixed(1)}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
