"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useBrandName } from "@/lib/useBrandName";
import { MODEL_LABELS } from "@/lib/constants";
import { Loader2, Printer } from "lucide-react";

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
    topFrames?: { frame: string; percentage: number }[];
    topSourceType?: { category: string; count: number; totalSources: number } | null;
    modelComparison?: { model: string; mentionRate: number; avgRank: number | null; sentiment?: number }[];
  };

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
            headers={["Platform", "Brand Recall", "Avg Position", "Sentiment"]}
            rows={o.modelComparison.map((m) => [
              MODEL_LABELS[m.model] ?? m.model,
              pct(m.mentionRate),
              m.avgRank != null ? pos(m.avgRank) : "\u2014",
              m.sentiment != null ? `${m.sentiment}%` : "\u2014",
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
    rankDistribution?: { rank: number; count: number; percentage: number }[];
    modelBreakdown?: { model: string; mentionRate: number | null; avgRank: number | null; firstMentionPct: number | null; totalRuns: number }[];
    visibilityRanking?: { entityId: string; name: string; score: number; isBrand: boolean }[];
    resultsByQuestion?: { promptText: string; model: string; aiVisibility: number; avgPosition: number | null; shareOfVoice: number }[];
    opportunityPrompts?: { prompt: string; competitorCount: number; competitors: string[] }[];
  };

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

      {v.rankDistribution && v.rankDistribution.length > 0 && (
        <>
          <SH3>Position Distribution</SH3>
          <Tbl headers={["Position", "Count", "%"]} rows={v.rankDistribution.map((r) => [`#${r.rank}`, r.count, `${r.percentage}%`])} />
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
    </div>
  );
}

function NarrativeSection({ d }: { d: Record<string, unknown> }) {
  if (!d) return <Empty label="No narrative data available." />;
  const n = d as {
    scorecard?: { sentimentSplit: { positive: number; neutral: number; negative: number } | null };
    frames?: { frame: string; percentage: number }[];
    strengths?: { text: string; count: number }[];
    weaknesses?: { text: string; count: number }[];
    examples?: { excerpt: string; model: string; matchedFrame: string }[];
    themes?: { label: string; count: number; pct: number }[];
    sentimentByQuestion?: { prompt: string; sentiment: string; mentionRate: number; consistency: number }[];
  };

  return (
    <div>
      {n.scorecard?.sentimentSplit && (
        <>
          <SH3>Sentiment Split</SH3>
          <KV label="Positive" value={pct(n.scorecard.sentimentSplit.positive)} />
          <KV label="Neutral" value={pct(n.scorecard.sentimentSplit.neutral)} />
          <KV label="Negative" value={pct(n.scorecard.sentimentSplit.negative)} />
        </>
      )}

      {n.frames && n.frames.length > 0 && (
        <>
          <SH3>How AI Describes This Brand</SH3>
          <Tbl headers={["Theme", "Frequency"]} rows={n.frames.slice(0, 8).map((f) => [f.frame, `${f.percentage}%`])} />
        </>
      )}

      {n.strengths && n.strengths.length > 0 && (
        <>
          <SH3>Strengths</SH3>
          {n.strengths.map((s, i) => <P key={i}><strong>{s.text}</strong> \u2014 {s.count} mention{s.count !== 1 ? "s" : ""}</P>)}
        </>
      )}

      {n.weaknesses && n.weaknesses.length > 0 && (
        <>
          <SH3>Weaknesses</SH3>
          {n.weaknesses.map((w, i) => <P key={i}><strong>{w.text}</strong> \u2014 {w.count} mention{w.count !== 1 ? "s" : ""}</P>)}
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
    </div>
  );
}

function LandscapeSection({ d }: { d: Record<string, unknown> }) {
  if (!d) return <Empty label="No landscape data available." />;
  const c = d as {
    competitors?: { name: string; mentionRate: number; mentionShare: number; avgRank: number | null; rank1Rate: number; isBrand: boolean }[];
    winLoss?: { byCompetitor: { name: string; wins: number; losses: number }[]; topLosses: { prompt: string; competitorName: string; competitorRank: number; brandRank: number | null }[] };
    coMentions?: { entityA: string; entityB: string; coMentionCount: number; coMentionRate: number }[];
  };

  return (
    <div>
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
    </div>
  );
}

function SourcesSection({ d }: { d: Record<string, unknown> }) {
  if (!d) return <Empty label="No sources data available." />;
  const s = d as {
    summary?: { totalCitations: number; uniqueDomains: number; citationsPerResponse: number; pctResponsesWithCitations: number };
    topDomains?: { domain: string; citations: number; category?: string }[];
    officialSites?: { entityId: string; isBrand: boolean; officialDomain: string; citations: number }[];
    domainsNotCitingBrand?: { domain: string; citations: number; competitors: [string, number][] }[];
    emerging?: { domain: string; currentCitations: number; previousCitations: number; growthRate: number }[];
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
          <SH3>Top Cited Sources</SH3>
          <Tbl headers={["Domain", "Citations", "Category"]} rows={s.topDomains.slice(0, 20).map((td) => [td.domain, td.citations, td.category ?? "\u2014"])} />
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

function ReportInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);
  const range = Number(searchParams.get("range") ?? 90);
  const model = searchParams.get("model") ?? "all";

  const [report, setReport] = useState<ReportData["report"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = `brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`;
        const [overviewRes, visibilityRes, narrativeRes, competitionRes, sourcesRes] = await Promise.all([
          fetch(`/api/overview?${qs}`).then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/visibility?${qs}`).then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/narrative?${qs}`).then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/competition?${qs}`).then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/sources?${qs}`).then((r) => r.ok ? r.json() : null).catch(() => null),
        ]);

        if (cancelled) return;

        const r: ReportData["report"] = {
          meta: {
            brandSlug: params.slug,
            brandName: brandName,
            model,
            range,
            generatedAt: new Date().toISOString(),
          },
          overview: overviewRes?.hasData ? {
            aiSummary: overviewRes.aiSummary ?? null,
            scorecard: {
              brandRecall: overviewRes.visibilityKpis?.overallMentionRate ?? null,
              shareOfVoice: overviewRes.visibilityKpis?.shareOfVoice ?? null,
              topResultRate: overviewRes.visibilityKpis?.firstMentionRate ?? null,
              avgPosition: overviewRes.visibilityKpis?.avgRankScore ?? null,
            },
            sentimentSplit: overviewRes.sentimentSplit ?? null,
            topFrames: overviewRes.overview?.topFrames ?? [],
            topSourceType: overviewRes.topSourceType ?? null,
            modelComparison: overviewRes.overview?.modelComparison ?? [],
          } : null,
          visibility: visibilityRes?.hasData ? {
            scorecard: {
              brandRecall: visibilityRes.visibility?.overallMentionRate ?? null,
              shareOfVoice: visibilityRes.visibility?.shareOfVoice ?? null,
              avgPosition: visibilityRes.visibility?.avgRankScore ?? null,
              topResultRate: visibilityRes.visibility?.firstMentionRate ?? null,
            },
            rankDistribution: visibilityRes.visibility?.rankDistribution ?? [],
            modelBreakdown: visibilityRes.visibility?.modelBreakdown ?? [],
            visibilityRanking: visibilityRes.visibility?.visibilityRanking ?? [],
            resultsByQuestion: visibilityRes.visibility?.resultsByQuestion ?? [],
            opportunityPrompts: visibilityRes.visibility?.opportunityPrompts ?? [],
          } : null,
          narrative: narrativeRes?.hasData ? {
            scorecard: {
              sentimentSplit: narrativeRes.narrative?.sentimentSplit ?? null,
            },
            frames: narrativeRes.narrative?.frames ?? [],
            strengths: narrativeRes.narrative?.strengths ?? [],
            weaknesses: narrativeRes.narrative?.weaknesses ?? [],
            themes: narrativeRes.narrative?.themes ?? [],
            examples: narrativeRes.narrative?.examples ?? [],
            sentimentByQuestion: narrativeRes.narrative?.sentimentByQuestion ?? [],
          } : null,
          landscape: competitionRes?.hasData ? {
            competitors: competitionRes.competition?.competitors ?? [],
            winLoss: competitionRes.competition?.winLoss ?? null,
            coMentions: competitionRes.competition?.coMentions ?? [],
          } : null,
          sources: sourcesRes?.hasData ? {
            summary: sourcesRes.sources?.summary ?? null,
            topDomains: sourcesRes.sources?.topDomains ?? [],
            officialSites: sourcesRes.sources?.officialSites ?? [],
            domainsNotCitingBrand: sourcesRes.sources?.domainsNotCitingBrand ?? [],
            emerging: sourcesRes.sources?.emerging ?? [],
          } : null,
        };

        setReport(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load report data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [params.slug, model, range, brandName]);

  if (loading) {
    return (
      <div className="max-w-[900px] mx-auto px-8 py-16 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-4 text-gray-400" />
        <p className="text-sm text-gray-500">Generating full report — this may take a moment...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-[900px] mx-auto px-8 py-16 text-center">
        <p className="text-sm text-gray-500">{error ?? "No report data available. Run prompts first."}</p>
      </div>
    );
  }

  const r = report;

  return (
    <div className="max-w-[900px] mx-auto px-8 py-10 print:px-0 print:py-0 print:max-w-none">
      <style>{`
        @media print {
          nav, header, .no-print, .print-hide { display: none !important; }
          body { font-size: 11px; color: #111; }
          h2 { page-break-after: avoid; }
          h3 { page-break-after: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }
        @page { margin: 0.6in; }
      `}</style>

      <div className="flex items-center justify-between mb-8 no-print">
        <div>
          <h1 className="text-2xl font-bold">{r.meta.brandName} \u2014 AI Visibility Report</h1>
          <p className="text-sm text-gray-500 mt-1">
            {MODEL_LABELS[r.meta.model] ?? r.meta.model} &middot; {r.meta.range}-day window &middot; Generated {new Date(r.meta.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Printer className="h-4 w-4" />
          Print / Save PDF
        </button>
      </div>

      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold">{r.meta.brandName} \u2014 AI Visibility Report</h1>
        <p className="text-xs text-gray-500 mt-1">
          {MODEL_LABELS[r.meta.model] ?? r.meta.model} &middot; {r.meta.range}-day window &middot; {new Date(r.meta.generatedAt).toLocaleDateString()}
        </p>
      </div>

      <SH>Overview</SH>
      {r.overview ? <OverviewSection d={r.overview} /> : <Empty label="No overview data available." />}

      <SH>Visibility</SH>
      {r.visibility ? <VisibilitySection d={r.visibility} /> : <Empty label="No visibility data available." />}

      <SH>Narrative</SH>
      {r.narrative ? <NarrativeSection d={r.narrative} /> : <Empty label="No narrative data available." />}

      <SH>Issue Landscape</SH>
      {r.landscape ? <LandscapeSection d={r.landscape} /> : <Empty label="No landscape data available." />}

      <SH>Sources</SH>
      {r.sources ? <SourcesSection d={r.sources} /> : <Empty label="No sources data available." />}

      <div className="mt-10 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center print:mt-6">
        {r.meta.brandName} AI Visibility Report &middot; {new Date(r.meta.generatedAt).toLocaleDateString()}
      </div>
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
