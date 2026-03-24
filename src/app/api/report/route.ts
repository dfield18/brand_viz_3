import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

/**
 * GET /api/report?brandSlug=...&model=...&range=...
 *
 * Composes a canonical full-report payload by calling the 5 tab APIs
 * server-side. This guarantees the report uses the exact same data
 * pipelines as the dashboard tabs — no duplicated logic, no drift.
 */
export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const model = req.nextUrl.searchParams.get("model") ?? "all";
  const range = req.nextUrl.searchParams.get("range") ?? "90";

  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  // Build origin from the incoming request
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  const origin = `${proto}://${host}`;

  // Forward cookies for auth
  const cookie = req.headers.get("cookie") ?? "";
  const fetchOpts: RequestInit = {
    headers: { cookie },
    cache: "no-store",
  };

  const qs = `brandSlug=${encodeURIComponent(brandSlug)}&model=${encodeURIComponent(model)}&range=${range}`;

  // Fetch all 5 tab APIs in parallel
  const [overviewRes, visibilityRes, narrativeRes, competitionRes, sourcesRes] = await Promise.all([
    fetch(`${origin}/api/overview?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/visibility?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/narrative?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/competition?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/sources?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
  ]);

  // Extract brandName from whichever responded
  const brandName =
    overviewRes?.overview?.brandName ??
    narrativeRes?.narrative?.brandName ??
    visibilityRes?.brandName ??
    brandSlug;

  const report = {
    meta: {
      brandSlug,
      brandName,
      model,
      range: parseInt(range, 10),
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
      kpiDeltas: overviewRes.kpiDeltas ?? null,
      competitiveRank: overviewRes.competitiveRank ?? null,
      topSourceType: overviewRes.topSourceType ?? null,
      modelComparison: overviewRes.overview?.modelComparison ?? [],
      clusterVisibility: overviewRes.overview?.clusterVisibility ?? [],
    } : null,
    visibility: visibilityRes?.hasData ? {
      scorecard: {
        brandRecall: visibilityRes.visibility?.overallMentionRate ?? null,
        shareOfVoice: visibilityRes.visibility?.shareOfVoice ?? null,
        avgPosition: visibilityRes.visibility?.avgRankScore ?? null,
        topResultRate: visibilityRes.visibility?.firstMentionRate ?? null,
      },
      kpiDeltas: visibilityRes.visibility?.kpiDeltas ?? null,
      trend: visibilityRes.visibility?.trend ?? [],
      rankDistribution: visibilityRes.visibility?.rankDistribution ?? [],
      positionDistribution: visibilityRes.visibility?.positionDistribution ?? [],
      modelBreakdown: visibilityRes.visibility?.modelBreakdown ?? [],
      clusterBreakdown: visibilityRes.visibility?.clusterBreakdown ?? [],
      intentSplit: visibilityRes.visibility?.intentSplit ?? [],
      visibilityRanking: visibilityRes.visibility?.visibilityRanking ?? [],
      resultsByQuestion: visibilityRes.visibility?.resultsByQuestion ?? [],
      opportunityPrompts: visibilityRes.visibility?.opportunityPrompts ?? [],
      worstPerformingPrompts: visibilityRes.visibility?.worstPerformingPrompts ?? [],
      topPromptWins: visibilityRes.visibility?.topPromptWins ?? [],
    } : null,
    narrative: narrativeRes?.hasData ? {
      scorecard: {
        dominantNarratives: narrativeRes.narrative?.frames?.slice(0, 3)?.map((f: { frame: string; percentage: number }) => ({ name: f.frame, percentage: f.percentage })) ?? [],
        sentimentSplit: narrativeRes.narrative?.sentimentSplit ?? null,
        polarization: narrativeRes.narrative?.polarization ?? null,
        authorityRate: narrativeRes.narrative?.authorityRate ?? null,
        trustRate: narrativeRes.narrative?.trustRate ?? null,
        weaknessRate: narrativeRes.narrative?.weaknessRate ?? null,
      },
      frames: narrativeRes.narrative?.frames ?? [],
      sentimentTrend: narrativeRes.narrative?.sentimentTrend ?? [],
      frameTrend: narrativeRes.narrative?.frameTrend ?? [],
      themes: narrativeRes.narrative?.themes ?? [],
      descriptors: narrativeRes.narrative?.descriptors ?? [],
      strengths: narrativeRes.narrative?.strengths ?? [],
      weaknesses: narrativeRes.narrative?.weaknesses ?? [],
      weaknessesAreNeutral: narrativeRes.narrative?.weaknessesAreNeutral ?? false,
      examples: narrativeRes.narrative?.examples ?? [],
      sentimentByQuestion: narrativeRes.narrative?.sentimentByQuestion ?? [],
      drift: narrativeRes.narrative?.drift ?? null,
      narrativeDeltas: narrativeRes.narrativeDeltas ?? null,
    } : null,
    landscape: competitionRes?.hasData ? {
      scope: competitionRes.competition?.scope ?? null,
      competitors: competitionRes.competition?.competitors ?? [],
      fragmentation: competitionRes.competition?.fragmentation ?? null,
      rankDistribution: competitionRes.competition?.rankDistribution ?? [],
      promptMatrix: competitionRes.competition?.promptMatrix ?? [],
      winLoss: competitionRes.competition?.winLoss ?? null,
      modelSplit: competitionRes.competition?.modelSplit ?? [],
      competitiveTrend: competitionRes.competition?.competitiveTrend ?? [],
      prominenceShare: competitionRes.competition?.prominenceShare ?? [],
      competitiveOpportunities: competitionRes.competition?.competitiveOpportunities ?? [],
      coMentions: competitionRes.competition?.coMentions ?? [],
      competitorNarratives: competitionRes.competition?.competitorNarratives ?? [],
      sentimentTrend: competitionRes.competition?.sentimentTrend ?? [],
    } : null,
    sources: sourcesRes?.hasData ? {
      scope: sourcesRes.sources?.scope ?? null,
      summary: sourcesRes.sources?.summary ?? null,
      topDomains: sourcesRes.sources?.topDomains ?? [],
      modelSplit: sourcesRes.sources?.modelSplit ?? [],
      emerging: sourcesRes.sources?.emerging ?? [],
      crossCitation: sourcesRes.sources?.crossCitation ?? [],
      domainsNotCitingBrand: sourcesRes.sources?.domainsNotCitingBrand ?? [],
      officialSites: sourcesRes.sources?.officialSites ?? [],
      sourcePromptMatrix: sourcesRes.sources?.sourcePromptMatrix ?? [],
      matrixPrompts: sourcesRes.sources?.matrixPrompts ?? [],
      brandAttributedSources: sourcesRes.sources?.brandAttributedSources ?? [],
      categoryOverTime: sourcesRes.sources?.categoryOverTime ?? [],
      domainOverTime: sourcesRes.sources?.domainOverTime ?? [],
      entityNames: sourcesRes.entityNames ?? {},
    } : null,
  };

  return NextResponse.json({ hasData: true, report }, {
    headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
  });
}
