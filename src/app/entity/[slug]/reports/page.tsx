"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useBrandName } from "@/lib/useBrandName";
import { MODEL_LABELS } from "@/lib/constants";
import { Loader2, Printer, Mail, Check, Send } from "lucide-react";
import { sentimentLabel, stabilityLabel } from "@/lib/overview/modelComparisonDisplay";

/* ─── Shared Renderers ───────────────────────────────────────────────── */

function SH({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold mt-10 mb-4 border-b-2 border-gray-300 pb-2 print:mt-6 print:break-after-avoid">{children}</h2>;
}

function SH3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold mt-5 mb-2 print:break-after-avoid">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>;
}

function KV({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-semibold">{value ?? "\u2014"}</span>
    </div>
  );
}

function Tbl({ headers, rows }: { headers: string[]; rows: (string | number | null)[][] }) {
  if (!rows || rows.length === 0) return <P>No data available.</P>;
  return (
    <table className="w-full text-xs border-collapse mb-4">
      <thead>
        <tr className="border-b-2 border-gray-300">
          {headers.map((h) => <th key={h} className="text-left py-2 pr-3 font-semibold text-gray-600">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-gray-100">
            {row.map((cell, j) => <td key={j} className="py-1.5 pr-3">{cell ?? "\u2014"}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ label }: { label: string }) {
  return <P><em>{label}</em></P>;
}

function pct(v: number | null | undefined) {
  return v != null ? `${v}%` : "\u2014";
}

function pos(v: number | null | undefined) {
  return v != null && v > 0 ? `#${typeof v === "number" ? v.toFixed(1) : v}` : "\u2014";
}

/* ─── Section Renderers ──────────────────────────────────────────────── */

function OverviewSection({ d }: { d: Record<string, unknown> }) {
  if (!d) return <Empty label="No overview data available." />;
  const o = d as {
    aiSummary?: string | null;
    scorecard?: { brandRecall: number | null; shareOfVoice: number | null; topResultRate: number | null; avgPosition: number | null };
    sentimentSplit?: { positive: number; neutral: number; negative: number } | null;
    kpiDeltas?: { mentionRate: number; shareOfVoice: number; avgRank: number; firstMentionRate: number } | null;
    topFrames?: { frame: string; percentage: number }[];
    topSourceType?: { category: string; count: number; totalSources: number } | null;
    modelComparison?: { model: string; mentionRate: number; avgRank: number | null; sentiment?: number; sentimentSplit?: { positive: number; neutral: number; negative: number }; narrativeStability?: number }[];
    quotes?: { quote: string; model: string; context: string }[];
    competitorAlerts?: { displayName: string; direction: string; recentMentionRate: number; previousMentionRate: number; mentionRateChange: number }[];
  };

  // Find declining metrics from kpiDeltas
  const declining = o.kpiDeltas ? Object.entries(o.kpiDeltas).filter(([, v]) => typeof v === "number" && v < 0) : [];

  return (
    <div>
      {o.aiSummary && <P><em>{o.aiSummary}</em></P>}

      {o.scorecard && (
        <>
          <SH3>Visibility Scorecard</SH3>
          <KV label="Brand Recall" value={pct(o.scorecard.brandRecall)} />
          <KV label="Share of Voice" value={pct(o.scorecard.shareOfVoice)} />
          <KV label="Top Result Rate" value={pct(o.scorecard.topResultRate)} />
          <KV label="Avg Position" value={pos(o.scorecard.avgPosition)} />
        </>
      )}

      {declining.length > 0 && (
        <>
          <SH3>Declining Metrics</SH3>
          {declining.map(([key, val]) => (
            <P key={key}>{key === "mentionRate" ? "Mention Rate" : key === "shareOfVoice" ? "Share of Voice" : key === "avgRank" ? "Avg Position" : key === "firstMentionRate" ? "Top Result Rate" : key}: {typeof val === "number" ? val.toFixed(1) : val} pts vs prior month</P>
          ))}
        </>
      )}

      {o.sentimentSplit && (
        <>
          <SH3>Sentiment</SH3>
          <KV label="Positive" value={pct(o.sentimentSplit.positive)} />
          <KV label="Neutral" value={pct(o.sentimentSplit.neutral)} />
          <KV label="Negative" value={pct(o.sentimentSplit.negative)} />
        </>
      )}

      {o.topFrames && o.topFrames.length > 0 && (
        <>
          <SH3>Top Narratives</SH3>
          <Tbl headers={["Narrative", "Frequency"]} rows={o.topFrames.slice(0, 8).map((f) => [f.frame, `${f.percentage}%`])} />
        </>
      )}

      {o.topSourceType && (
        <>
          <SH3>Most Cited Source Type</SH3>
          <KV label={o.topSourceType.category} value={`${Math.round((o.topSourceType.count / Math.max(o.topSourceType.totalSources, 1)) * 100)}%`} />
        </>
      )}

      {o.modelComparison && o.modelComparison.length > 0 && (
        <>
          <SH3>By AI Platform</SH3>
          <Tbl
            headers={["Platform", "Brand Recall", "Avg Sentiment", "Top Result Rate", "Message Consistency"]}
            rows={o.modelComparison.map((m) => [
              MODEL_LABELS[m.model] ?? m.model,
              pct(m.mentionRate),
              sentimentLabel(m.sentimentSplit),
              (m as Record<string, unknown>).topResultRate != null ? `${(m as Record<string, unknown>).topResultRate}%` : "\u2014",
              m.narrativeStability != null ? stabilityLabel(m.narrativeStability) : "\u2014",
            ])}
          />
        </>
      )}

      {o.quotes && o.quotes.length > 0 && (
        <>
          <SH3>What AI Is Saying</SH3>
          {o.quotes.map((q, i) => (
            <div key={i} className="mb-3 pl-3 border-l-2 border-gray-300">
              <p className="text-sm text-gray-700 italic">&ldquo;{q.quote}&rdquo;</p>
              <p className="text-xs text-gray-500 mt-1">{MODEL_LABELS[q.model] ?? q.model} &middot; {q.context}</p>
            </div>
          ))}
        </>
      )}

      {o.competitorAlerts && o.competitorAlerts.length > 0 && (
        <>
          <SH3>Competitor Movement</SH3>
          <Tbl
            headers={["Competitor", "Direction", "Previous", "Recent", "Change"]}
            rows={o.competitorAlerts.map((a) => [
              a.displayName,
              a.direction,
              `${Math.round((a.previousMentionRate ?? 0) * 100)}%`,
              `${Math.round((a.recentMentionRate ?? 0) * 100)}%`,
              `${a.mentionRateChange > 0 ? "+" : ""}${Math.round((a.mentionRateChange ?? 0) * 100)} pts`,
            ])}
          />
        </>
      )}
    </div>
  );
}

function VisibilitySection({ d }: { d: Record<string, unknown> }) {
  if (!d) return <Empty label="No visibility data available." />;
  const v = d as {
    scorecard?: { brandRecall: number | null; shareOfVoice: number | null; avgPosition: number | null; topResultRate: number | null };
    trend?: { date: string; model: string; prompt: string; mentionRate: number; avgPosition: number | null; firstMentionPct: number | null; sovPct: number | null }[];
    rankDistribution?: { rank: number; count: number; percentage: number }[];
    modelBreakdown?: { model: string; mentionRate: number | null; avgRank: number | null; firstMentionPct: number | null; totalRuns: number }[];
    visibilityRanking?: { entityId: string; name: string; score: number; isBrand: boolean }[];
    resultsByQuestion?: { promptText: string; model: string; aiVisibility: number; avgPosition: number | null; shareOfVoice: number }[];
    opportunityPrompts?: { prompt: string; competitorCount: number; competitors: string[] }[];
    worstPerformingPrompts?: { prompt: string; rank: number | null; competitors: string[] }[];
    intentSplit?: { intent: string; percentage: number }[];
    clusterBreakdown?: { cluster: string; mentionRate: number; avgRank: number | null }[];
  };

  // Aggregate trend to "all" model/prompt only for the summary table
  const trendSummary = (v.trend ?? [])
    .filter((t) => t.model === "all" && t.prompt === "all")
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      {v.scorecard && (
        <>
          <SH3>Scorecard</SH3>
          <KV label="Brand Recall" value={pct(v.scorecard.brandRecall)} />
          <KV label="Share of Voice" value={pct(v.scorecard.shareOfVoice)} />
          <KV label="Top Result Rate" value={pct(v.scorecard.topResultRate)} />
          <KV label="Avg Position" value={pos(v.scorecard.avgPosition)} />
        </>
      )}

      {trendSummary.length > 1 && (
        <>
          <SH3>Visibility Over Time</SH3>
          <Tbl
            headers={["Date", "Brand Recall", "Share of Voice", "Top Result", "Avg Position"]}
            rows={trendSummary.map((t) => [
              t.date,
              `${t.mentionRate}%`,
              t.sovPct != null ? `${t.sovPct}%` : "\u2014",
              t.firstMentionPct != null ? `${t.firstMentionPct}%` : "\u2014",
              t.avgPosition != null ? `#${t.avgPosition.toFixed(1)}` : "\u2014",
            ])}
          />
        </>
      )}

      {v.rankDistribution && v.rankDistribution.length > 0 && (
        <>
          <SH3>Position Distribution</SH3>
          <Tbl headers={["Position", "Count", "%"]} rows={v.rankDistribution.map((r) => [r.rank === 0 ? "Not Mentioned" : `#${r.rank}`, r.count, `${r.percentage}%`])} />
        </>
      )}

      {v.modelBreakdown && v.modelBreakdown.length > 0 && (
        <>
          <SH3>By AI Platform</SH3>
          <Tbl
            headers={["Platform", "Recall", "Avg Position", "Top Result", "Runs"]}
            rows={v.modelBreakdown.filter((m) => m.totalRuns > 0).map((m) => [
              MODEL_LABELS[m.model] ?? m.model,
              m.mentionRate != null ? `${m.mentionRate}%` : "\u2014",
              m.avgRank != null ? `#${m.avgRank.toFixed(1)}` : "\u2014",
              m.firstMentionPct != null ? `${m.firstMentionPct}%` : "\u2014",
              m.totalRuns,
            ])}
          />
        </>
      )}

      {v.visibilityRanking && v.visibilityRanking.length > 0 && (
        <>
          <SH3>Visibility Ranking</SH3>
          <Tbl headers={["Entity", "Score"]} rows={v.visibilityRanking.slice(0, 10).map((e) => [e.isBrand ? `\u2605 ${e.name}` : e.name, `${e.score}%`])} />
        </>
      )}

      {v.resultsByQuestion && v.resultsByQuestion.length > 0 && (
        <>
          <SH3>Performance by Question</SH3>
          <Tbl
            headers={["Prompt", "Platform", "Visibility", "Avg Position", "SoV"]}
            rows={v.resultsByQuestion.slice(0, 20).map((r) => [
              (r.promptText ?? "").length > 60 ? (r.promptText ?? "").slice(0, 60) + "..." : (r.promptText ?? ""),
              MODEL_LABELS[r.model] ?? r.model,
              `${r.aiVisibility}%`,
              r.avgPosition != null ? `#${r.avgPosition.toFixed(1)}` : "\u2014",
              `${r.shareOfVoice}%`,
            ])}
          />
        </>
      )}

      {v.opportunityPrompts && v.opportunityPrompts.length > 0 && (
        <>
          <SH3>Opportunity Prompts (Brand Missing)</SH3>
          <Tbl headers={["Prompt", "Competitors Present"]} rows={v.opportunityPrompts.slice(0, 10).map((p) => [p.prompt, (p.competitors ?? []).slice(0, 3).join(", ")])} />
        </>
      )}

      {v.worstPerformingPrompts && v.worstPerformingPrompts.length > 0 && (
        <>
          <SH3>Worst Performing Prompts</SH3>
          <Tbl
            headers={["Prompt", "Brand Rank", "Top Competitors"]}
            rows={v.worstPerformingPrompts.slice(0, 10).map((w) => [
              (w.prompt ?? "").length > 60 ? (w.prompt ?? "").slice(0, 60) + "..." : (w.prompt ?? ""),
              w.rank != null ? `#${w.rank}` : "Not mentioned",
              (w.competitors ?? []).slice(0, 3).join(", "),
            ])}
          />
        </>
      )}

      {v.intentSplit && v.intentSplit.length > 0 && (
        <>
          <SH3>By Question Intent</SH3>
          {v.intentSplit.map((is) => <KV key={is.intent} label={is.intent} value={`${is.percentage}%`} />)}
        </>
      )}

      {v.clusterBreakdown && v.clusterBreakdown.length > 0 && (
        <>
          <SH3>By Question Type</SH3>
          <Tbl
            headers={["Cluster", "Mention Rate", "Avg Rank"]}
            rows={v.clusterBreakdown.map((cb) => [
              cb.cluster,
              `${cb.mentionRate}%`,
              cb.avgRank != null ? `#${cb.avgRank.toFixed(1)}` : "\u2014",
            ])}
          />
        </>
      )}
    </div>
  );
}

function NarrativeSection({ d }: { d: Record<string, unknown> }) {
  if (!d) return <Empty label="No narrative data available." />;
  const n = d as {
    scorecard?: {
      sentimentSplit: { positive: number; neutral: number; negative: number } | null;
      polarization?: string | null;
      platformConsistency?: number | null;
      hedgingRate?: number | null;
      modelConfidence?: number | null;
    };
    frames?: { frame: string; percentage: number; byModel?: Record<string, number> }[];
    sentimentTrend?: { date: string; model: string; positive: number }[];
    frameTrend?: Record<string, string | number>[];
    strengths?: { text: string; count: number }[];
    weaknesses?: { text: string; count: number }[];
    examples?: { excerpt: string; model: string; matchedFrame: string }[];
    drift?: { emerging: string[]; declining: string[] } | null;
    narrativeDeltas?: { sentimentPositive: number; confidence: number } | null;
    positioning?: { legitimacy: number; controversy: number; label: string }[];
    perceptionIssue?: { text: string } | null;
    emergingTopics?: { topicKey: string; label: string; mentions: number; growth: string }[];
    themes?: { label: string; count: number; pct: number }[];
    sentimentByQuestion?: { prompt: string; sentiment: string; mentionRate: number; consistency: number }[];
  };

  return (
    <div>
      <SH3>Narrative Scorecard</SH3>
      {n.scorecard?.sentimentSplit && (
        <>
          <KV label="Positive" value={pct(n.scorecard.sentimentSplit.positive)} />
          <KV label="Neutral" value={pct(n.scorecard.sentimentSplit.neutral)} />
          <KV label="Negative" value={pct(n.scorecard.sentimentSplit.negative)} />
        </>
      )}
      {n.scorecard?.platformConsistency != null && <KV label="Platform Consistency" value={`${n.scorecard.platformConsistency}%`} />}
      {n.scorecard?.polarization && <KV label="Polarization" value={n.scorecard.polarization} />}
      {n.scorecard?.modelConfidence != null && <KV label="Model Confidence" value={`${n.scorecard.modelConfidence}%`} />}

      {n.narrativeDeltas && (n.narrativeDeltas.sentimentPositive !== 0 || n.narrativeDeltas.confidence !== 0) && (
        <P><em>
          {n.narrativeDeltas.sentimentPositive !== 0 && `Sentiment ${n.narrativeDeltas.sentimentPositive > 0 ? "+" : ""}${n.narrativeDeltas.sentimentPositive} pts vs prior month. `}
          {n.narrativeDeltas.confidence !== 0 && `Confidence ${n.narrativeDeltas.confidence > 0 ? "+" : ""}${n.narrativeDeltas.confidence} pts vs prior month.`}
        </em></P>
      )}

      {(() => {
        const st = (n.sentimentTrend ?? []).filter((t) => t.model === "all").sort((a, b) => a.date.localeCompare(b.date));
        return st.length > 1 ? (
          <>
            <SH3>Sentiment Over Time</SH3>
            <Tbl headers={["Date", "% Positive"]} rows={st.map((t) => [t.date, `${t.positive}%`])} />
          </>
        ) : null;
      })()}

      {(() => {
        const ft = (n.frameTrend ?? []).filter((t) => (t as Record<string, unknown>).model === "all").sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
        if (ft.length <= 1) return null;
        const frameNames = Object.keys(ft[0] ?? {}).filter((k) => k !== "date" && k !== "model");
        if (frameNames.length === 0) return null;
        return (
          <>
            <SH3>Narrative Frame Trend</SH3>
            <Tbl
              headers={["Date", ...frameNames.slice(0, 5)]}
              rows={ft.map((row) => [String(row.date ?? ""), ...frameNames.slice(0, 5).map((f) => `${row[f] ?? 0}%`)])}
            />
          </>
        );
      })()}

      {n.frames && n.frames.length > 0 && (
        <>
          <SH3>How AI Describes This Brand</SH3>
          <Tbl headers={["Theme", "Frequency"]} rows={n.frames.slice(0, 8).map((f) => [f.frame, `${f.percentage}%`])} />
        </>
      )}

      {n.strengths && n.strengths.length > 0 && (
        <>
          <SH3>Strengths</SH3>
          {n.strengths.map((s, i) => <P key={i}><strong>{s.text}</strong> &mdash; {s.count} mention{s.count !== 1 ? "s" : ""}</P>)}
        </>
      )}

      {n.weaknesses && n.weaknesses.length > 0 && (
        <>
          <SH3>Weaknesses</SH3>
          {n.weaknesses.map((w, i) => <P key={i}><strong>{w.text}</strong> &mdash; {w.count} mention{w.count !== 1 ? "s" : ""}</P>)}
        </>
      )}

      {n.themes && n.themes.length > 0 && (
        <>
          <SH3>Themes</SH3>
          <Tbl headers={["Theme", "Count", "%"]} rows={n.themes.slice(0, 10).map((t) => [t.label, t.count, `${t.pct}%`])} />
        </>
      )}

      {n.examples && n.examples.length > 0 && (
        <>
          <SH3>What AI Is Saying</SH3>
          {n.examples.slice(0, 5).map((ex, i) => (
            <div key={i} className="mb-3 pl-3 border-l-2 border-gray-300">
              <p className="text-sm text-gray-700 italic">&ldquo;{ex.excerpt}&rdquo;</p>
              <p className="text-xs text-gray-500 mt-1">{MODEL_LABELS[ex.model] ?? ex.model} &middot; {ex.matchedFrame}</p>
            </div>
          ))}
        </>
      )}

      {n.sentimentByQuestion && n.sentimentByQuestion.length > 0 && (
        <>
          <SH3>Sentiment by Question</SH3>
          <Tbl
            headers={["Prompt", "Sentiment", "Mention Rate", "Consistency"]}
            rows={n.sentimentByQuestion.slice(0, 15).map((q) => [
              (q.prompt ?? "").length > 50 ? (q.prompt ?? "").slice(0, 50) + "..." : (q.prompt ?? ""),
              q.sentiment, `${q.mentionRate}%`, `${q.consistency}%`,
            ])}
          />
        </>
      )}

      {(() => {
        // Sentiment by Platform: extract latest per-model sentiment from sentimentTrend
        const st = n.sentimentTrend ?? [];
        const latestDate = st.filter((t) => t.model === "all").sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
        if (!latestDate) return null;
        const modelEntries = st.filter((t) => t.model !== "all" && t.date === latestDate);
        if (modelEntries.length === 0) return null;
        return (
          <>
            <SH3>Sentiment by Platform</SH3>
            <Tbl
              headers={["Platform", "% Positive"]}
              rows={modelEntries.map((m) => [MODEL_LABELS[m.model] ?? m.model, `${m.positive}%`])}
            />
          </>
        );
      })()}

      {n.perceptionIssue?.text && (
        <>
          <SH3>Perception Issue</SH3>
          <P><em>{n.perceptionIssue.text}</em></P>
        </>
      )}

      {n.emergingTopics && n.emergingTopics.length > 0 && (
        <>
          <SH3>Emerging Topics</SH3>
          <Tbl
            headers={["Topic", "Mentions", "Growth"]}
            rows={n.emergingTopics.slice(0, 10).map((t) => [
              t.label ?? t.topicKey ?? "\u2014",
              t.mentions ?? 0,
              t.growth ?? "\u2014",
            ])}
          />
        </>
      )}

      {n.drift && ((n.drift.emerging ?? []).length > 0 || (n.drift.declining ?? []).length > 0) && (
        <>
          <SH3>Theme Drift</SH3>
          {(n.drift.emerging ?? []).length > 0 && <P><strong>Emerging themes:</strong> {(n.drift.emerging ?? []).join(", ")}</P>}
          {(n.drift.declining ?? []).length > 0 && <P><strong>Declining themes:</strong> {(n.drift.declining ?? []).join(", ")}</P>}
        </>
      )}
    </div>
  );
}

function LandscapeSection({ d }: { d: Record<string, unknown> }) {
  if (!d) return <Empty label="No landscape data available." />;
  const c = d as {
    scope?: { totalResponses: number; entitiesTracked: number } | null;
    competitors?: { name: string; mentionRate: number; mentionShare: number; avgRank: number | null; rank1Rate: number; isBrand: boolean }[];
    fragmentation?: { score: number; hhi: number } | number | null;
    winLoss?: { byCompetitor: { name: string; wins: number; losses: number }[]; topLosses: { prompt: string; competitorName: string; competitorRank: number; brandRank: number | null }[] };
    coMentions?: { entityA: string; entityB: string; coMentionCount: number; coMentionRate: number }[];
    competitiveTrend?: { date: string; mentionRate: Record<string, number>; mentionShare: Record<string, number> }[];
    sentimentTrend?: { date: string; sentiment: Record<string, number> }[];
    prominenceShare?: { entityId: string; name: string; mentionRate: number; mentionShare: number; isBrand: boolean }[];
    modelSplit?: { model: string; competitors: { entityId: string; name: string; mentionShare: number }[] }[];
    competitorNarratives?: { entityId: string; name: string; sentiment: string; topFrames: string[] }[];
  };

  // Compute win rate from byCompetitor
  const brandWins = (c.winLoss?.byCompetitor ?? []).reduce((s, w) => s + w.wins, 0);
  const brandTotal = (c.winLoss?.byCompetitor ?? []).reduce((s, w) => s + w.wins + w.losses, 0);

  return (
    <div>
      {(c.scope || c.fragmentation != null) && (
        <>
          <SH3>Landscape Scorecard</SH3>
          {c.scope && <KV label="Competitors Tracked" value={c.scope.entitiesTracked} />}
          {c.fragmentation != null && <KV label="Market Fragmentation" value={typeof c.fragmentation === "object" ? c.fragmentation.score : c.fragmentation} />}
          {brandTotal > 0 && <KV label="Win Rate" value={`${Math.round((brandWins / brandTotal) * 100)}%`} />}
        </>
      )}

      {c.competitors && c.competitors.length > 0 && (
        <>
          <SH3>Competitive Landscape</SH3>
          <Tbl
            headers={["Entity", "Recall", "Share of Voice", "Avg Position", "Top Result"]}
            rows={c.competitors.slice(0, 12).map((comp) => [
              comp.isBrand ? `\u2605 ${comp.name}` : comp.name,
              `${comp.mentionRate}%`, `${comp.mentionShare.toFixed(1)}%`,
              comp.avgRank != null ? `#${comp.avgRank.toFixed(1)}` : "\u2014", `${comp.rank1Rate}%`,
            ])}
          />
        </>
      )}

      {c.winLoss?.byCompetitor && c.winLoss.byCompetitor.length > 0 && (
        <>
          <SH3>Win Rate</SH3>
          <Tbl
            headers={["Competitor", "Wins", "Losses", "Win Rate"]}
            rows={c.winLoss.byCompetitor.slice(0, 10).map((w) => {
              const total = w.wins + w.losses;
              return [w.name, w.wins, w.losses, total > 0 ? `${Math.round((w.wins / total) * 100)}%` : "\u2014"];
            })}
          />
        </>
      )}

      {c.winLoss?.topLosses && c.winLoss.topLosses.length > 0 && (
        <>
          <SH3>Top Losing Prompts</SH3>
          <Tbl
            headers={["Prompt", "Competitor", "Their Rank", "Brand Rank"]}
            rows={c.winLoss.topLosses.slice(0, 10).map((l) => [
              (l.prompt ?? "").length > 50 ? (l.prompt ?? "").slice(0, 50) + "..." : (l.prompt ?? ""),
              l.competitorName, `#${l.competitorRank}`,
              l.brandRank != null ? `#${l.brandRank}` : "Not mentioned",
            ])}
          />
        </>
      )}

      {c.coMentions && c.coMentions.length > 0 && (
        <>
          <SH3>Brand Associations</SH3>
          <Tbl
            headers={["Entity A", "Entity B", "Co-mentions", "Rate"]}
            rows={c.coMentions.slice(0, 10).map((cm) => [cm.entityA, cm.entityB, cm.coMentionCount, `${cm.coMentionRate}%`])}
          />
        </>
      )}

      {c.modelSplit && c.modelSplit.length > 0 && (
        <>
          <SH3>By AI Platform</SH3>
          {c.modelSplit.map((ms) => (
            <div key={ms.model} className="mb-3">
              <P><strong>{MODEL_LABELS[ms.model] ?? ms.model}</strong></P>
              {(ms.competitors ?? []).length > 0 && (
                <Tbl
                  headers={["Entity", "Share of Voice"]}
                  rows={(ms.competitors ?? []).slice(0, 5).map((comp) => [comp.name, `${comp.mentionShare.toFixed(1)}%`])}
                />
              )}
            </div>
          ))}
        </>
      )}

      {c.competitorNarratives && c.competitorNarratives.length > 0 && (
        <>
          <SH3>Competitor Narratives</SH3>
          {c.competitorNarratives.slice(0, 8).map((cn) => (
            <P key={cn.entityId}>
              <strong>{cn.name}</strong> — Sentiment: {cn.sentiment ?? "N/A"}.
              {(cn.topFrames ?? []).length > 0 && ` Key themes: ${(cn.topFrames ?? []).slice(0, 3).join(", ")}.`}
            </P>
          ))}
        </>
      )}

      {c.prominenceShare && c.prominenceShare.length > 0 && (
        <>
          <SH3>Who Gets Mentioned vs Who Gets Praised</SH3>
          <Tbl
            headers={["Entity", "Mention Rate", "Share of Voice"]}
            rows={c.prominenceShare.slice(0, 10).map((p) => [
              p.isBrand ? `\u2605 ${p.name}` : p.name,
              `${p.mentionRate}%`,
              `${p.mentionShare.toFixed(1)}%`,
            ])}
          />
        </>
      )}

      {(() => {
        const st = c.sentimentTrend ?? [];
        if (st.length <= 1) return null;
        const entities = Object.keys(st[0]?.sentiment ?? {}).slice(0, 5);
        if (entities.length === 0) return null;
        return (
          <>
            <SH3>Sentiment by Brand Over Time</SH3>
            <Tbl
              headers={["Date", ...entities]}
              rows={st.map((t) => [t.date, ...entities.map((e) => `${(t.sentiment?.[e] ?? 0)}%`)])}
            />
          </>
        );
      })()}

      {(() => {
        const ct = c.competitiveTrend ?? [];
        if (ct.length <= 1) return null;
        const entities = Object.keys(ct[0]?.mentionRate ?? {}).slice(0, 5);
        if (entities.length === 0) return null;
        return (
          <>
            <SH3>Competitive Trend (Mention Rate)</SH3>
            <Tbl
              headers={["Date", ...entities]}
              rows={ct.map((t) => [t.date, ...entities.map((e) => `${(t.mentionRate?.[e] ?? 0).toFixed(1)}%`)])}
            />
          </>
        );
      })()}
    </div>
  );
}

function SourcesSection({ d }: { d: Record<string, unknown> }) {
  if (!d) return <Empty label="No sources data available." />;
  const s = d as {
    summary?: { totalCitations: number; uniqueDomains: number; citationsPerResponse: number; pctResponsesWithCitations: number };
    topDomains?: { domain: string; citations: number; responses?: number; category?: string; avgRankWhenCited?: number | null; rank1RateWhenCited?: number | null; firstSeen?: string; lastSeen?: string }[];
    officialSites?: { entityId: string; isBrand: boolean; officialDomain: string; citations: number }[];
    domainsNotCitingBrand?: { domain: string; citations: number; competitors: [string, number][] }[];
    emerging?: { domain: string; currentCitations: number; previousCitations: number; growthRate: number }[];
    domainOverTime?: Record<string, string | number>[];
    crossCitation?: { domain: string; entityCounts: Record<string, number> }[];
  };

  return (
    <div>
      {s.summary && (
        <>
          <SH3>Source Summary</SH3>
          <KV label="Total Citations" value={s.summary.totalCitations} />
          <KV label="Unique Domains" value={s.summary.uniqueDomains} />
          <KV label="Citations per Response" value={s.summary.citationsPerResponse.toFixed(1)} />
          <KV label="Responses with Citations" value={`${s.summary.pctResponsesWithCitations}%`} />
        </>
      )}

      {s.topDomains && s.topDomains.length > 0 && (
        <>
          <SH3>All Sources</SH3>
          <Tbl
            headers={["Domain", "Citations", "Responses", "Category", "Avg Rank", "Top Result", "First Seen", "Last Seen"]}
            rows={s.topDomains.slice(0, 25).map((td) => [
              td.domain,
              td.citations,
              td.responses ?? "\u2014",
              td.category ?? "\u2014",
              td.avgRankWhenCited != null ? `#${td.avgRankWhenCited.toFixed(1)}` : "\u2014",
              td.rank1RateWhenCited != null ? `${td.rank1RateWhenCited}%` : "\u2014",
              td.firstSeen ?? "\u2014",
              td.lastSeen ?? "\u2014",
            ])}
          />
        </>
      )}

      {s.officialSites && s.officialSites.length > 0 && (
        <>
          <SH3>Official Website Citations</SH3>
          <Tbl headers={["Entity", "Domain", "Citations"]} rows={s.officialSites.map((os) => [os.isBrand ? `\u2605 ${os.entityId}` : os.entityId, os.officialDomain, os.citations])} />
        </>
      )}

      {s.domainsNotCitingBrand && s.domainsNotCitingBrand.length > 0 && (
        <>
          <SH3>Sources Not Citing Brand</SH3>
          <Tbl headers={["Domain", "Citations", "Cited For"]} rows={s.domainsNotCitingBrand.slice(0, 15).map((d) => [d.domain, d.citations, (d.competitors ?? []).slice(0, 3).map(([id]) => id).join(", ")])} />
        </>
      )}

      {s.emerging && s.emerging.length > 0 && (
        <>
          <SH3>Emerging Sources</SH3>
          <Tbl headers={["Domain", "Current", "Previous", "Growth"]} rows={s.emerging.slice(0, 10).map((e) => [e.domain, e.currentCitations, e.previousCitations, `+${e.growthRate}%`])} />
        </>
      )}

      {(() => {
        const dot = (s.domainOverTime ?? []).filter((r) => (r as Record<string, unknown>).model === "all");
        if (dot.length <= 1) return null;
        const domains = Object.keys(dot[0] ?? {}).filter((k) => k !== "date" && k !== "model");
        if (domains.length === 0) return null;
        return (
          <>
            <SH3>Source Trends Over Time</SH3>
            <Tbl
              headers={["Date", ...domains.slice(0, 6)]}
              rows={dot.map((row) => [String(row.date ?? ""), ...domains.slice(0, 6).map((d) => String(row[d] ?? 0))])}
            />
          </>
        );
      })()}

      {s.crossCitation && s.crossCitation.length > 0 && (() => {
        const entities = new Set<string>();
        for (const row of s.crossCitation!) for (const id of Object.keys(row.entityCounts ?? {})) entities.add(id);
        const entityList = [...entities].slice(0, 6);
        if (entityList.length === 0) return null;
        return (
          <>
            <SH3>Source Citation Matrix</SH3>
            <Tbl
              headers={["Domain", ...entityList]}
              rows={(s.crossCitation ?? []).slice(0, 15).map((cc) => [
                cc.domain,
                ...entityList.map((e) => (cc.entityCounts ?? {})[e] ?? 0),
              ])}
            />
          </>
        );
      })()}
    </div>
  );
}

/* ─── Main Report Page ───────────────────────────────────────────────── */

interface ReportData {
  hasData: boolean;
  report?: {
    meta: { brandSlug: string; brandName: string; model: string; range: number; generatedAt: string };
    overview: Record<string, unknown> | null;
    visibility: Record<string, unknown> | null;
    narrative: Record<string, unknown> | null;
    landscape: Record<string, unknown> | null;
    sources: Record<string, unknown> | null;
  };
}

function EmailSubscribePanel({ brandSlug }: { brandSlug: string }) {
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [preferredHour, setPreferredHour] = useState(9);
  const [preferredDay, setPreferredDay] = useState(1); // weekly: 1=Mon; monthly: 1=1st
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<{ email: string; frequency: string; preferredHour?: number; preferredDay?: number; enabled: boolean }[]>([]);

  useEffect(() => {
    fetch(`/api/reports/subscribe?brandSlug=${encodeURIComponent(brandSlug)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.subscriptions) setSubscriptions(data.subscriptions); })
      .catch(() => {});
  }, [brandSlug]);

  async function handleSubscribe() {
    if (!email.trim()) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/reports/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug, email: email.trim(), frequency, preferredHour, preferredDay }),
      });
      if (res.ok) {
        setStatus("saved");
        setSubscriptions((prev) => {
          const existing = prev.find((s) => s.email === email.trim());
          if (existing) return prev.map((s) => s.email === email.trim() ? { ...s, frequency, enabled: true } : s);
          return [...prev, { email: email.trim(), frequency, enabled: true }];
        });
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  async function handleSendNow() {
    setSendStatus("sending");
    setSendError(null);
    try {
      const res = await fetch("/api/reports/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.sent > 0) {
        setSendStatus("sent");
        setTimeout(() => setSendStatus("idle"), 5000);
      } else {
        setSendStatus("error");
        const detail = data?.errors?.join("; ") || data?.message || data?.error || `HTTP ${res.status}`;
        setSendError(detail);
      }
    } catch (err) {
      setSendStatus("error");
      setSendError(err instanceof Error ? err.message : "Network error");
    }
  }

  const activeCount = subscriptions.filter((s) => s.enabled).length;

  return (
    <div className="rounded-xl border border-border bg-card p-5 no-print">
      <div className="flex items-center gap-2 mb-3">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Email Reports</h3>
        {activeCount > 0 && (
          <span className="text-xs text-muted-foreground">({activeCount} active)</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Get this report delivered to your inbox automatically.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
          className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        {frequency === "weekly" && (
          <select
            value={preferredDay}
            onChange={(e) => setPreferredDay(Number(e.target.value))}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
          >
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
        )}
        {frequency === "monthly" && (
          <select
            value={preferredDay}
            onChange={(e) => setPreferredDay(Number(e.target.value))}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}
              </option>
            ))}
          </select>
        )}
        <select
          value={preferredHour}
          onChange={(e) => setPreferredHour(Number(e.target.value))}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`} EST
            </option>
          ))}
        </select>
        <button
          onClick={handleSubscribe}
          disabled={status === "saving" || !email.trim()}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {status === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
           status === "saved" ? <Check className="h-3.5 w-3.5" /> :
           <Mail className="h-3.5 w-3.5" />}
          {status === "saved" ? "Subscribed" : "Subscribe"}
        </button>
      </div>
      {status === "error" && (
        <p className="text-xs text-red-500 mt-2">Failed to subscribe. Please try again.</p>
      )}

      {/* Send now + active subscriptions */}
      {activeCount > 0 && (
        <div className="mt-4 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                {activeCount} subscriber{activeCount !== 1 ? "s" : ""} &mdash; {frequency === "daily" ? "Daily" : frequency === "weekly" ? `${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][preferredDay] ?? "Mondays"}` : `${preferredDay}${preferredDay === 1 ? "st" : preferredDay === 2 ? "nd" : preferredDay === 3 ? "rd" : "th"} of each month`} at {preferredHour === 0 ? "12am" : preferredHour < 12 ? `${preferredHour}am` : preferredHour === 12 ? "12pm" : `${preferredHour - 12}pm`} EST
              </p>
            </div>
            <button
              onClick={handleSendNow}
              disabled={sendStatus === "sending"}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50 transition-colors"
            >
              {sendStatus === "sending" ? <Loader2 className="h-3 w-3 animate-spin" /> :
               sendStatus === "sent" ? <Check className="h-3 w-3 text-emerald-600" /> :
               <Send className="h-3 w-3" />}
              {sendStatus === "sending" ? "Sending..." : sendStatus === "sent" ? "Sent!" : "Send now"}
            </button>
          </div>
          {sendStatus === "error" && (
            <p className="text-xs text-red-500 mt-1">Failed to send{sendError ? `: ${sendError}` : ". Check that RESEND_API_KEY is configured."}</p>
          )}

          {/* Subscription list with remove */}
          <div className="mt-3 space-y-1.5">
            {subscriptions.filter((s) => s.enabled).map((sub) => (
              <div key={sub.email} className="flex items-center justify-between text-xs py-1">
                <span className="text-muted-foreground">{sub.email} &middot; {sub.frequency}</span>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/reports/subscribe", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ brandSlug, email: sub.email }),
                    });
                    if (res.ok) {
                      setSubscriptions((prev) => prev.map((s) => s.email === sub.email ? { ...s, enabled: false } : s));
                    }
                  }}
                  className="text-red-500 hover:text-red-700 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error === "No subscription found") {
        // No Pro subscription — silently ignore
        setLoading(false);
      } else {
        alert(data.error || "Failed to open billing portal");
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50 transition-colors"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      Manage Pro Subscription
    </button>
  );
}

function ReportInner() {
  const params = useParams<{ slug: string }>();
  const brandName = useBrandName(params.slug);

  return (
    <div className="max-w-[900px] mx-auto px-8 py-10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">{brandName} &mdash; Reports</h1>
          <p className="text-sm text-gray-500">
            Set up automated email reports for your team.
          </p>
        </div>
        <ManageSubscriptionButton />
      </div>

      <EmailSubscribePanel brandSlug={params.slug} />
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-500">Loading report...</div>}>
      <ReportInner />
    </Suspense>
  );
}
