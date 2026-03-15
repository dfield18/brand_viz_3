"use client";

interface Props {
  positive: number;
  neutral: number;
  negative: number;
}

export function SentimentSnapshot({ positive, neutral, negative }: Props) {
  const total = positive + neutral + negative;
  if (total === 0) return null;

  const segments = [
    { label: "Positive", pct: positive, color: "bg-emerald-500" },
    { label: "Neutral", pct: neutral, color: "bg-slate-300" },
    { label: "Negative", pct: negative, color: "bg-red-400" },
  ].filter((s) => s.pct > 0);

  return (
    <section className="rounded-xl bg-card px-5 py-4 shadow-section">
      <h2 className="text-sm font-semibold mb-3">Sentiment Snapshot</h2>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden">
        {segments.map((s) => (
          <div
            key={s.label}
            className={`${s.color} transition-all duration-300`}
            style={{ width: `${s.pct}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${s.color}`} />
            <span className="text-xs text-muted-foreground">
              {s.label} <span className="font-medium text-foreground">{s.pct}%</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
