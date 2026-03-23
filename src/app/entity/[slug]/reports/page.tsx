"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { useBrandName } from "@/lib/useBrandName";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { Loader2 } from "lucide-react";

/* ─── Lightweight renderers for each tab's API data ──────────────────── */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold mt-10 mb-4 border-b-2 border-gray-300 pb-2 print:mt-6">{children}</h2>;
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold mt-6 mb-2">{children}</h3>;
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>;
}

function KpiRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-semibold">{value}{unit ? ` ${unit}` : ""}</span>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-xs border-collapse mb-4">
      <thead>
        <tr className="border-b-2 border-gray-300">
          {headers.map((h) => <th key={h} className="text-left py-2 pr-4 font-semibold text-gray-600">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-gray-100">
            {row.map((cell, j) => <td key={j} className="py-1.5 pr-4">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Overview Section ───────────────────────────────────────────────── */

function OverviewSection({ slug, model, range }: { slug: string; model: string; range: number }) {
  const { data } = useCachedFetch<Record<string, unknown>>(
    `/api/overview?brandSlug=${slug}&model=${model}&range=${range}`,
  );
  if (!data || !(data as { hasData?: boolean }).hasData) return <Para>No overview data available.</Para>;

  const d = data as {
    visibilityKpis?: { overallMentionRate: number; shareOfVoice: number; firstMentionRate: number; avgRankScore: number };
    sentimentSplit?: { positive: number; neutral: number; negative: number };
    overview?: { topFrames?: { frame: string; percentage: number }[] };
    aiSummary?: string;
  };

  return (
    <div>
      {d.aiSummary && <Para><em>{d.aiSummary}</em></Para>}

      {d.visibilityKpis && (
        <>
          <SubHeading>Visibility KPIs</SubHeading>
          <KpiRow label="Brand Recall" value={`${d.visibilityKpis.overallMentionRate}%`} />
          <KpiRow label="Share of Voice" value={`${d.visibilityKpis.shareOfVoice}%`} />
          <KpiRow label="Top Result Rate" value={`${d.visibilityKpis.firstMentionRate}%`} />
          <KpiRow label="Avg Position" value={d.visibilityKpis.avgRankScore > 0 ? `#${d.visibilityKpis.avgRankScore.toFixed(1)}` : "—"} />
        </>
      )}

      {d.sentimentSplit && (
        <>
          <SubHeading>Sentiment</SubHeading>
          <KpiRow label="Positive" value={`${d.sentimentSplit.positive}%`} />
          <KpiRow label="Neutral" value={`${d.sentimentSplit.neutral}%`} />
          <KpiRow label="Negative" value={`${d.sentimentSplit.negative}%`} />
        </>
      )}

      {d.overview?.topFrames && d.overview.topFrames.length > 0 && (
        <>
          <SubHeading>Top Narratives</SubHeading>
          <DataTable
            headers={["Narrative", "Frequency"]}
            rows={d.overview.topFrames.slice(0, 8).map((f) => [f.frame, `${f.percentage}%`])}
          />
        </>
      )}
    </div>
  );
}

/* ─── Visibility Section ─────────────────────────────────────────────── */

function VisibilitySection({ slug, model, range }: { slug: string; model: string; range: number }) {
  const { data } = useCachedFetch<Record<string, unknown>>(
    `/api/visibility?brandSlug=${slug}&model=${model}&range=${range}`,
  );
  if (!data || !(data as { hasData?: boolean }).hasData) return <Para>No visibility data available.</Para>;

  const d = data as {
    overallMentionRate?: number;
    shareOfVoice?: number;
    firstMentionRate?: number;
    avgRankScore?: number;
    modelBreakdown?: { model: string; mentionRate: number | null; avgRank: number | null; firstMentionPct: number | null }[];
    rankDistribution?: { rank: number; count: number; percentage: number }[];
    clusterBreakdown?: { cluster: string; mentionRate: number }[];
  };

  return (
    <div>
      <SubHeading>KPI Summary</SubHeading>
      <KpiRow label="Brand Recall" value={`${d.overallMentionRate ?? 0}%`} />
      <KpiRow label="Share of Voice" value={`${d.shareOfVoice ?? 0}%`} />
      <KpiRow label="Top Result Rate" value={`${d.firstMentionRate ?? 0}%`} />
      <KpiRow label="Avg Position" value={(d.avgRankScore ?? 0) > 0 ? `#${(d.avgRankScore ?? 0).toFixed(1)}` : "—"} />

      {d.modelBreakdown && d.modelBreakdown.length > 0 && (
        <>
          <SubHeading>By AI Platform</SubHeading>
          <DataTable
            headers={["Platform", "Recall", "Avg Position", "Top Result"]}
            rows={d.modelBreakdown
              .filter((m) => m.mentionRate !== null)
              .map((m) => [
                MODEL_LABELS[m.model] ?? m.model,
                `${m.mentionRate}%`,
                m.avgRank !== null ? `#${m.avgRank.toFixed(1)}` : "—",
                m.firstMentionPct !== null ? `${m.firstMentionPct}%` : "—",
              ])}
          />
        </>
      )}

      {d.rankDistribution && d.rankDistribution.length > 0 && (
        <>
          <SubHeading>Position Distribution</SubHeading>
          <DataTable
            headers={["Position", "Count", "%"]}
            rows={d.rankDistribution.map((r) => [`#${r.rank}`, r.count, `${r.percentage}%`])}
          />
        </>
      )}
    </div>
  );
}

/* ─── Narrative Section ──────────────────────────────────────────────── */

function NarrativeSection({ slug, model, range }: { slug: string; model: string; range: number }) {
  const { data } = useCachedFetch<Record<string, unknown>>(
    `/api/narrative?brandSlug=${slug}&model=${model}&range=${range}`,
  );
  if (!data || !(data as { hasData?: boolean }).hasData) return <Para>No narrative data available.</Para>;

  const d = data as {
    narrative?: {
      frames?: { frame: string; percentage: number }[];
      sentimentSplit?: { positive: number; neutral: number; negative: number };
      strengths?: { text: string; count: number }[];
      weaknesses?: { text: string; count: number }[];
      examples?: { excerpt: string; model: string; matchedFrame: string }[];
    };
  };
  const n = d.narrative;
  if (!n) return <Para>No narrative data available.</Para>;

  return (
    <div>
      {n.sentimentSplit && (
        <>
          <SubHeading>Sentiment Split</SubHeading>
          <KpiRow label="Positive" value={`${n.sentimentSplit.positive}%`} />
          <KpiRow label="Neutral" value={`${n.sentimentSplit.neutral}%`} />
          <KpiRow label="Negative" value={`${n.sentimentSplit.negative}%`} />
        </>
      )}

      {n.frames && n.frames.length > 0 && (
        <>
          <SubHeading>How AI Describes This Brand</SubHeading>
          <DataTable
            headers={["Theme", "Frequency"]}
            rows={n.frames.slice(0, 8).map((f) => [f.frame, `${f.percentage}%`])}
          />
        </>
      )}

      {n.strengths && n.strengths.length > 0 && (
        <>
          <SubHeading>Strengths</SubHeading>
          {n.strengths.map((s, i) => (
            <Para key={i}><strong>{s.text}</strong> — mentioned {s.count} time{s.count !== 1 ? "s" : ""}</Para>
          ))}
        </>
      )}

      {n.weaknesses && n.weaknesses.length > 0 && (
        <>
          <SubHeading>Weaknesses</SubHeading>
          {n.weaknesses.map((w, i) => (
            <Para key={i}><strong>{w.text}</strong> — mentioned {w.count} time{w.count !== 1 ? "s" : ""}</Para>
          ))}
        </>
      )}

      {n.examples && n.examples.length > 0 && (
        <>
          <SubHeading>What AI Is Saying</SubHeading>
          {n.examples.slice(0, 5).map((ex, i) => (
            <div key={i} className="mb-3 pl-3 border-l-2 border-gray-300">
              <p className="text-sm text-gray-700 italic">&ldquo;{ex.excerpt}&rdquo;</p>
              <p className="text-xs text-gray-500 mt-1">{MODEL_LABELS[ex.model] ?? ex.model} &middot; {ex.matchedFrame}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ─── Competition Section ────────────────────────────────────────────── */

function CompetitionSection({ slug, model, range }: { slug: string; model: string; range: number }) {
  const { data } = useCachedFetch<Record<string, unknown>>(
    `/api/competition?brandSlug=${slug}&model=${model}&range=${range}`,
  );
  if (!data || !(data as { hasData?: boolean }).hasData) return <Para>No competition data available.</Para>;

  const d = data as {
    competition?: {
      competitors?: { name: string; mentionRate: number; mentionShare: number; avgRank: number | null; rank1Rate: number; isBrand: boolean }[];
      winLoss?: { byCompetitor: { name: string; wins: number; losses: number }[] };
    };
  };
  const c = d.competition;
  if (!c?.competitors) return <Para>No competition data available.</Para>;

  return (
    <div>
      <SubHeading>Competitive Landscape</SubHeading>
      <DataTable
        headers={["Entity", "Recall", "Share of Voice", "Avg Position", "Top Result"]}
        rows={c.competitors.slice(0, 10).map((comp) => [
          comp.isBrand ? `★ ${comp.name}` : comp.name,
          `${comp.mentionRate}%`,
          `${comp.mentionShare.toFixed(1)}%`,
          comp.avgRank !== null ? `#${comp.avgRank.toFixed(1)}` : "—",
          `${comp.rank1Rate}%`,
        ])}
      />

      {c.winLoss?.byCompetitor && c.winLoss.byCompetitor.length > 0 && (
        <>
          <SubHeading>Win Rate</SubHeading>
          <DataTable
            headers={["Competitor", "Wins", "Losses", "Win Rate"]}
            rows={c.winLoss.byCompetitor.slice(0, 10).map((w) => {
              const total = w.wins + w.losses;
              return [w.name, w.wins, w.losses, total > 0 ? `${Math.round((w.wins / total) * 100)}%` : "—"];
            })}
          />
        </>
      )}
    </div>
  );
}

/* ─── Sources Section ────────────────────────────────────────────────── */

function SourcesSection({ slug, model, range }: { slug: string; model: string; range: number }) {
  const { data } = useCachedFetch<Record<string, unknown>>(
    `/api/sources?brandSlug=${slug}&model=${model}&range=${range}`,
  );
  if (!data || !(data as { hasData?: boolean }).hasData) return <Para>No sources data available.</Para>;

  const d = data as {
    sources?: {
      summary?: { totalCitations: number; uniqueDomains: number; citationsPerResponse: number; pctResponsesWithCitations: number };
      topDomains?: { domain: string; citations: number; category?: string }[];
    };
  };
  const s = d.sources;
  if (!s) return <Para>No sources data available.</Para>;

  return (
    <div>
      {s.summary && (
        <>
          <SubHeading>Source Summary</SubHeading>
          <KpiRow label="Total Citations" value={s.summary.totalCitations} />
          <KpiRow label="Unique Domains" value={s.summary.uniqueDomains} />
          <KpiRow label="Citations per Response" value={s.summary.citationsPerResponse.toFixed(1)} />
          <KpiRow label="Responses with Citations" value={`${s.summary.pctResponsesWithCitations}%`} />
        </>
      )}

      {s.topDomains && s.topDomains.length > 0 && (
        <>
          <SubHeading>Top Cited Sources</SubHeading>
          <DataTable
            headers={["Domain", "Citations", "Category"]}
            rows={s.topDomains.slice(0, 15).map((td) => [td.domain, td.citations, td.category ?? "—"])}
          />
        </>
      )}
    </div>
  );
}

/* ─── Recommendations Section ────────────────────────────────────────── */

function RecommendationsSection({ slug, model, range }: { slug: string; model: string; range: number }) {
  const { data } = useCachedFetch<Record<string, unknown>>(
    `/api/recommendations?brandSlug=${slug}&model=${model}&range=${range}`,
  );
  if (!data || !(data as { hasData?: boolean }).hasData) return <Para>No recommendations data available.</Para>;

  const d = data as {
    promptOpportunities?: { promptText: string; brandRank: number | null; topCompetitors: { displayName: string; rank: number }[] }[];
    negativeNarratives?: { weaknesses: { weakness: string; count: number }[] };
    competitorAlerts?: { displayName: string; direction: string; recentMentionRate: number; previousMentionRate: number }[];
    sourceGapOpportunities?: { domain: string; totalCitations: number; competitorsCited: string[] }[];
  };

  return (
    <div>
      {d.promptOpportunities && d.promptOpportunities.length > 0 && (
        <>
          <SubHeading>Prompt Opportunities</SubHeading>
          {d.promptOpportunities.slice(0, 10).map((p, i) => (
            <div key={i} className="mb-3">
              <p className="text-sm font-medium">&ldquo;{p.promptText}&rdquo;</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Brand rank: {p.brandRank !== null ? `#${p.brandRank}` : "Not mentioned"}
                {p.topCompetitors.length > 0 && ` · Competitors: ${p.topCompetitors.slice(0, 3).map((c) => `${c.displayName} #${c.rank}`).join(", ")}`}
              </p>
            </div>
          ))}
        </>
      )}

      {d.negativeNarratives?.weaknesses && d.negativeNarratives.weaknesses.length > 0 && (
        <>
          <SubHeading>Negative Narratives</SubHeading>
          {d.negativeNarratives.weaknesses.slice(0, 5).map((w, i) => (
            <Para key={i}><strong>{w.weakness}</strong> — {w.count} mention{w.count !== 1 ? "s" : ""}</Para>
          ))}
        </>
      )}

      {d.competitorAlerts && d.competitorAlerts.length > 0 && (
        <>
          <SubHeading>Competitor Movement</SubHeading>
          <DataTable
            headers={["Competitor", "Direction", "Previous", "Recent"]}
            rows={d.competitorAlerts.slice(0, 10).map((a) => [
              a.displayName,
              a.direction,
              `${Math.round(a.previousMentionRate * 100)}%`,
              `${Math.round(a.recentMentionRate * 100)}%`,
            ])}
          />
        </>
      )}

      {d.sourceGapOpportunities && d.sourceGapOpportunities.length > 0 && (
        <>
          <SubHeading>Source Gaps</SubHeading>
          <DataTable
            headers={["Domain", "Citations", "Competitors Cited"]}
            rows={d.sourceGapOpportunities.slice(0, 10).map((sg) => [
              sg.domain,
              sg.totalCitations,
              sg.competitorsCited.slice(0, 3).join(", "),
            ])}
          />
        </>
      )}
    </div>
  );
}

/* ─── Main Report Page ───────────────────────────────────────────────── */

function ReportInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);
  const range = Number(searchParams.get("range") ?? 90);
  const model = searchParams.get("model") ?? "all";
  const [ready, setReady] = useState(false);

  // Auto-print after data loads
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => window.print(), 1500);
    return () => clearTimeout(timer);
  }, [ready]);

  // Mark ready after initial render + data fetch settle
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="max-w-[900px] mx-auto px-8 py-10 print:px-0 print:py-0 print:max-w-none">
      {/* Print styles */}
      <style>{`
        @media print {
          nav, header, .no-print { display: none !important; }
          body { font-size: 12px; color: #111; }
          h2 { page-break-after: avoid; }
          h3 { page-break-after: avoid; }
          .print-section { page-break-inside: avoid; }
        }
        @page { margin: 0.75in; }
      `}</style>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{brandName} — AI Visibility Report</h1>
        <p className="text-sm text-gray-500 mt-1">
          {MODEL_LABELS[model] ?? model} &middot; {range}-day window &middot; Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {!ready && (
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 no-print">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading report data... The print dialog will open automatically.
        </div>
      )}

      <SectionHeading>Overview</SectionHeading>
      <OverviewSection slug={params.slug} model={model} range={range} />

      <SectionHeading>Visibility</SectionHeading>
      <VisibilitySection slug={params.slug} model={model} range={range} />

      <SectionHeading>Narrative</SectionHeading>
      <NarrativeSection slug={params.slug} model={model} range={range} />

      <SectionHeading>Issue Landscape</SectionHeading>
      <CompetitionSection slug={params.slug} model={model} range={range} />

      <SectionHeading>Sources</SectionHeading>
      <SourcesSection slug={params.slug} model={model} range={range} />

      <SectionHeading>Recommendations</SectionHeading>
      <RecommendationsSection slug={params.slug} model={model} range={range} />

      <div className="mt-10 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center print:mt-6">
        {brandName} AI Visibility Report &middot; {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-500">Generating report...</div>}>
      <ReportInner />
    </Suspense>
  );
}
