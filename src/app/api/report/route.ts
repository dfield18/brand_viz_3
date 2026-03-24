import { NextRequest, NextResponse } from "next/server";
import {
  platformConsistencyFromPolarization,
  modelConfidenceFromHedgingRate,
} from "@/lib/narrative/reportHelpers";

/**
 * GET /api/report?brandSlug=...&model=...&range=...
 *
 * Composes a canonical full-report payload by calling tab APIs
 * server-side. Includes recommendations + topics for full narrative parity.
 */
export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const model = req.nextUrl.searchParams.get("model") ?? "all";
  const range = req.nextUrl.searchParams.get("range") ?? "90";

  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  const origin = `${proto}://${host}`;
  const cookie = req.headers.get("cookie") ?? "";
  const fetchOpts: RequestInit = { headers: { cookie }, cache: "no-store" };
  const qs = `brandSlug=${encodeURIComponent(brandSlug)}&model=${encodeURIComponent(model)}&range=${range}`;

  // Fetch all 7 APIs in parallel (5 tabs + recommendations + topics)
  const [overviewRes, visibilityRes, narrativeRes, competitionRes, sourcesRes, recsRes, topicsRes, quotesRes, alertsRes] = await Promise.all([
    fetch(`${origin}/api/overview?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/visibility?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/narrative?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/competition?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/sources?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/recommendations?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/topics?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/visibility/quotes?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/competitor-alerts?${qs}`, fetchOpts).then((r) => r.json()).catch(() => null),
  ]);

  const brandName =
    overviewRes?.overview?.brandName ??
    narrativeRes?.narrative?.brandName ??
    visibilityRes?.brandName ??
    brandSlug;

  // Derive perception issue from recommendations
  const negWeaknesses = recsRes?.negativeNarratives?.weaknesses ?? [];
  const narrativeSummary = recsRes?.negativeNarratives?.narrativeSummary ?? "";
  const perceptionIssue = negWeaknesses.length > 0
    ? {
        text: narrativeSummary
          ? narrativeSummary.split("\n").filter(Boolean)[0] ?? negWeaknesses[0]?.suggestion ?? ""
          : negWeaknesses[0]?.suggestion ?? "",
      }
    : null;

  // Derive emerging topics from topics API
  const emergingTopics = topicsRes?.hasData && topicsRes.topics?.emerging
    ? topicsRes.topics.emerging
    : [];

  // Narrative scorecard with canonical derived fields
  const polarization = narrativeRes?.narrative?.polarization ?? null;
  const hedgingRate = narrativeRes?.narrative?.hedgingRate ?? null;

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
      kpiDeltas: overviewRes.kpiDeltas ?? null,
      topFrames: overviewRes.overview?.topFrames ?? [],
      topSourceType: overviewRes.topSourceType ?? null,
      modelComparison: overviewRes.overview?.modelComparison ?? [],
      competitiveRank: overviewRes.competitiveRank ?? null,
      quotes: quotesRes?.quotes ?? [],
      competitorAlerts: alertsRes?.competitorAlerts ?? [],
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
      modelBreakdown: visibilityRes.visibility?.modelBreakdown ?? [],
      visibilityRanking: visibilityRes.visibility?.visibilityRanking ?? [],
      resultsByQuestion: visibilityRes.visibility?.resultsByQuestion ?? [],
      opportunityPrompts: visibilityRes.visibility?.opportunityPrompts ?? [],
      worstPerformingPrompts: visibilityRes.visibility?.worstPerformingPrompts ?? [],
      intentSplit: visibilityRes.visibility?.intentSplit ?? [],
      clusterBreakdown: visibilityRes.visibility?.clusterBreakdown ?? [],
    } : null,
    narrative: narrativeRes?.hasData ? {
      scorecard: {
        dominantNarratives: narrativeRes.narrative?.frames?.slice(0, 3)?.map((f: { frame: string; percentage: number }) => ({ name: f.frame, percentage: f.percentage })) ?? [],
        sentimentSplit: narrativeRes.narrative?.sentimentSplit ?? null,
        polarization,
        platformConsistency: platformConsistencyFromPolarization(polarization),
        hedgingRate,
        modelConfidence: modelConfidenceFromHedgingRate(hedgingRate),
      },
      frames: narrativeRes.narrative?.frames ?? [],
      sentimentTrend: narrativeRes.narrative?.sentimentTrend ?? [],
      frameTrend: narrativeRes.narrative?.frameTrend ?? [],
      strengths: narrativeRes.narrative?.strengths ?? [],
      weaknesses: narrativeRes.narrative?.weaknesses ?? [],
      weaknessesAreNeutral: narrativeRes.narrative?.weaknessesAreNeutral ?? false,
      themes: narrativeRes.narrative?.themes ?? [],
      examples: narrativeRes.narrative?.examples ?? [],
      sentimentByQuestion: narrativeRes.narrative?.sentimentByQuestion ?? [],
      drift: narrativeRes.narrative?.drift ?? null,
      narrativeDeltas: narrativeRes.narrativeDeltas ?? null,
      positioning: narrativeRes.narrative?.positioning ?? [],
      perceptionIssue,
      emergingTopics,
    } : null,
    landscape: competitionRes?.hasData ? {
      scope: competitionRes.competition?.scope ?? null,
      competitors: competitionRes.competition?.competitors ?? [],
      fragmentation: competitionRes.competition?.fragmentation ?? null,
      winLoss: competitionRes.competition?.winLoss ?? null,
      coMentions: competitionRes.competition?.coMentions ?? [],
      competitiveTrend: competitionRes.competition?.competitiveTrend ?? [],
      sentimentTrend: competitionRes.competition?.sentimentTrend ?? [],
      prominenceShare: competitionRes.competition?.prominenceShare ?? [],
      competitorNarratives: competitionRes.competition?.competitorNarratives ?? [],
      modelSplit: competitionRes.competition?.modelSplit ?? [],
    } : null,
    sources: sourcesRes?.hasData ? {
      summary: sourcesRes.sources?.summary ?? null,
      topDomains: sourcesRes.sources?.topDomains ?? [],
      officialSites: sourcesRes.sources?.officialSites ?? [],
      domainsNotCitingBrand: sourcesRes.sources?.domainsNotCitingBrand ?? [],
      emerging: sourcesRes.sources?.emerging ?? [],
      domainOverTime: sourcesRes.sources?.domainOverTime ?? [],
      crossCitation: sourcesRes.sources?.crossCitation ?? [],
    } : null,
  };

  return NextResponse.json({ hasData: true, report }, {
    headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
  });
}
