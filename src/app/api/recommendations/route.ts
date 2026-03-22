import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBrandRuns } from "@/lib/apiPipeline";
import { VALID_MODELS } from "@/lib/constants";
import { buildEntityDisplayNames, resolveEntityName } from "@/lib/utils";
import { openai, getOpenAIDefault } from "@/lib/openai";
import { normalizeEntityIds } from "@/lib/competition/normalizeEntities";
import { computeCompetitorAlerts } from "@/lib/competitorAlerts";
import { buildMovementSnapshots, type MovementRun } from "@/lib/buildMovementSnapshots";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KNOWN_PUBS: Record<string, string> = {
  "nytimes.com": "The New York Times",
  "washingtonpost.com": "The Washington Post",
  "wsj.com": "The Wall Street Journal",
  "bbc.com": "BBC", "bbc.co.uk": "BBC",
  "cnn.com": "CNN",
  "reuters.com": "Reuters",
  "bloomberg.com": "Bloomberg",
  "forbes.com": "Forbes",
  "techcrunch.com": "TechCrunch",
  "theverge.com": "The Verge",
  "wired.com": "Wired",
  "arstechnica.com": "Ars Technica",
  "theguardian.com": "The Guardian",
  "fastcompany.com": "Fast Company",
  "businessinsider.com": "Business Insider",
  "cnbc.com": "CNBC",
  "apnews.com": "AP News",
  "nbcnews.com": "NBC News",
  "abcnews.go.com": "ABC News",
  "foxnews.com": "Fox News",
  "usatoday.com": "USA Today",
  "economist.com": "The Economist",
  "ft.com": "Financial Times",
  "medium.com": "Medium",
  "reddit.com": "Reddit",
  "wikipedia.org": "Wikipedia",
  "en.wikipedia.org": "Wikipedia",
};

function urlToPubName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return KNOWN_PUBS[hostname] ?? hostname.split(".").slice(-2, -1)[0];
  } catch {
    return "a news report";
  }
}

/** Parse a weakness claim into clean narrative text and any cited sources. */
function parseWeakness(raw: string): { narrative: string; sources: string[] } {
  // Remove leading markdown list markers
  let text = raw.replace(/^[\s]*[-*]\s+/, "");

  // Extract URLs and collect source names
  const sources: string[] = [];
  text = text.replace(/https?:\/\/[^\s)]+/g, (url) => {
    sources.push(urlToPubName(url));
    return "";
  });

  // Clean up leftover punctuation and whitespace
  text = text.replace(/\s{2,}/g, " ").replace(/^[,\s\-:]+|[,\s\-:]+$/g, "").trim();

  return { narrative: text, sources };
}

/** Build a readable weakness suggestion with the actual issue and cited sources. */
function buildWeaknessSuggestion(raw: string): string {
  const { narrative, sources } = parseWeakness(raw);

  const sourceLabel = sources.length > 0
    ? ` (cited from ${sources.join(" and ")})`
    : "";

  if (!narrative) {
    return sources.length > 0
      ? `AI is surfacing a negative narrative from ${sources.join(" and ")}. Review and consider publishing a response or counter-narrative.`
      : `A negative perception is appearing in AI responses. Consider publishing case studies or data that counter this narrative.`;
  }

  return `"${narrative}"${sourceLabel} \u2014 consider publishing content that directly addresses this perception.`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NarrativeJson {
  sentiment: { label: "POS" | "NEU" | "NEG"; score: number };
  themes: string[];
  claims: { type: "strength" | "weakness" | "neutral"; text: string }[];
  descriptors: string[];
}

interface ProminenceMetric {
  entityId: string;
  rankPosition: number | null;
  model: string;
  promptId: string;
}

interface SourceOccurrence {
  sourceId: string;
  normalizedUrl: string;
  entityId: string | null;
  model: string;
  source: { domain: string; category: string | null };
}

type RecommendationRun = {
  id: string;
  model: string;
  promptId: string;
  createdAt: Date;
  rawResponseText: string;
  analysisJson: unknown;
  narrativeJson: unknown;
  prompt: { text: string; cluster: string; intent: string; topicKey: string | null };
  prominenceMetrics: ProminenceMetric[];
  sourceOccurrences: SourceOccurrence[];
};

// ---------------------------------------------------------------------------
// Static platform tips
// ---------------------------------------------------------------------------

const PLATFORM_TIPS: Record<string, string> = {
  chatgpt:
    "ChatGPT favors structured comparison content, authoritative sources, and clear factual claims. Create detailed comparison pages and ensure presence on review aggregator sites.",
  gemini:
    "Gemini relies heavily on Google-indexed content and tutorial sites. Prioritize SEO-optimized content, how-to guides, and ensure the Google Business profile is complete.",
  claude:
    "Claude emphasizes nuanced, balanced analysis with web search verification. Publish detailed thought leadership content and ensure claims are backed by credible sources.",
  perplexity:
    "Perplexity aggregates from multiple live sources. Maintain fresh, frequently-updated content across authoritative domains and news outlets.",
  google:
    "Google AI Overviews pull from top-ranked search results. Focus on traditional SEO, featured snippet optimization, and structured data markup.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNarrative(raw: unknown): NarrativeJson | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  if (!n.sentiment || typeof n.sentiment !== "object") return null;
  if (!Array.isArray(n.themes)) return null;
  if (!Array.isArray(n.claims)) return null;
  return raw as NarrativeJson;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const model = req.nextUrl.searchParams.get("model") ?? "all";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10) || 90;

  const result = await fetchBrandRuns<RecommendationRun>({
    brandSlug,
    model,
    viewRange,
    runQuery: {
      include: {
        prompt: { select: { text: true, cluster: true, intent: true, topicKey: true } },
        prominenceMetrics: {
          select: {
            entityId: true,
            rankPosition: true,
            model: true,
            promptId: true,
          },
        },
        sourceOccurrences: {
          select: {
            sourceId: true,
            normalizedUrl: true,
            entityId: true,
            model: true,
            source: { select: { domain: true, category: true } },
          },
        },
      },
    },
  });

  if (!result.ok) return result.response;

  const { brand, runs } = result;
  const brandName = brand.displayName || brand.name;
  const isOrg = (brand as unknown as { category?: string | null }).category === "political_advocacy";
  const competitorWord = isOrg ? "other organizations" : "competitors";
  const entityDisplayNames = buildEntityDisplayNames(runs);
  entityDisplayNames.set(brand.slug, brandName);

  /** Expand {brand}, {industry}, and {competitor} placeholders in prompt text */
  const expandPrompt = (text: string, run?: RecommendationRun) => {
    const industryLabel = brand.industry || `${brandName}'s industry`;
    let expanded = text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, industryLabel);
    if (expanded.includes("{competitor}") && run) {
      // Infer competitor from the top-ranked non-brand entity in this run
      const topCompetitor = run.prominenceMetrics
        .filter((m) => m.entityId !== brand.slug && m.rankPosition !== null)
        .sort((a, b) => (a.rankPosition ?? 999) - (b.rankPosition ?? 999))[0];
      const compName = topCompetitor
        ? resolveEntityName(topCompetitor.entityId, entityDisplayNames)
        : "competitor";
      expanded = expanded.replace(/\{competitor\}/g, compName);
    }
    return expanded;
  };

  if (runs.length === 0) {
    return NextResponse.json({
      hasData: false,
      brandName: brandName,
      promptOpportunities: [],
      promptOpportunitySummary: "",
      platformPlaybooks: [],
      negativeNarratives: { weaknesses: [], negativeThemes: [], narrativeSummary: "" },
      competitorNarrativeGaps: [],
      competitorAlerts: [],
      sourceGapOpportunities: [],
      topicCoverageGaps: [],
      decliningMetrics: [],
    });
  }

  // -----------------------------------------------------------------------
  // 1. promptOpportunities
  // -----------------------------------------------------------------------
  const promptOpportunities: {
    promptText: string;
    cluster: string;
    brandRank: number | null;
    topCompetitors: { entityId: string; displayName: string; rank: number }[];
    suggestion: string;
  }[] = [];

  for (const run of runs) {
    const brandMetric = run.prominenceMetrics.find((m) => m.entityId === brand.slug);
    const brandRank = brandMetric?.rankPosition ?? null;
    const isOpportunity = brandRank === null || brandRank > 3;

    if (!isOpportunity) continue;

    const competitors = run.prominenceMetrics
      .filter((m) => m.entityId !== brand.slug && m.rankPosition !== null)
      .sort((a, b) => (a.rankPosition ?? 999) - (b.rankPosition ?? 999))
      .slice(0, 3)
      .map((m) => ({
        entityId: m.entityId,
        displayName: resolveEntityName(m.entityId, entityDisplayNames),
        rank: m.rankPosition!,
      }));

    const compNames = competitors.map((c) => c.displayName).join(", ");
    const expanded = expandPrompt(run.prompt.text, run);

    promptOpportunities.push({
      promptText: expanded,
      cluster: run.prompt.cluster,
      brandRank,
      topCompetitors: competitors,
      suggestion: competitors.length > 0
        ? `When AI is asked "${expanded}", ${competitorWord} ${compNames} currently dominate \u2014 create content to improve ${brandName}'s ranking for this query`
        : `When AI is asked "${expanded}", ${brandName} doesn\u2019t appear \u2014 create content to become visible for this query`,
    });
  }

  // Sort by number of well-ranking competitors (descending), limit to 15
  promptOpportunities.sort((a, b) => b.topCompetitors.length - a.topCompetitors.length);
  promptOpportunities.splice(15);

  // -----------------------------------------------------------------------
  // 1b. AI-generated prompt opportunities summary
  // -----------------------------------------------------------------------
  let promptOpportunitySummary = "";
  if (promptOpportunities.length > 0) {
    const lines = promptOpportunities.map((po) => {
      const rankStr = po.brandRank === null ? "not mentioned" : `ranked #${po.brandRank}`;
      const compStr = po.topCompetitors.length > 0
        ? `${isOrg ? "Organizations" : "Competitors"} ahead: ${po.topCompetitors.map((c) => `${c.displayName} (#${c.rank})`).join(", ")}`
        : `No ${competitorWord} ranked`;
      return `- Prompt: "${po.promptText}" — ${brandName} is ${rankStr}. ${compStr}`;
    });

    const gptPrompt = [
      `You are an AI visibility strategist writing for a marketing executive.`,
      `The brand is "${brandName}".`,
      `Below are the top prompts where ${brandName} is either absent or poorly ranked in AI responses.\n`,
      ...lines,
      `\nWrite a concise, actionable summary (3-5 bullet points) that a marketing executive can quickly scan. Each bullet should:`,
      `- Reference the actual AI prompts/questions from the data (not generic terms like "industry queries")`,
      `- Explain what content ${brandName} should create or improve`,
      `- Reference specific competitors from the data when relevant`,
      `Use the brand name "${brandName}" (not "you" or "your brand"). Do not use markdown formatting (no **, no #, no []()). Do not use headers or titles. Format each bullet as a line starting with "- " (a hyphen). Keep each bullet to 1-2 sentences.`,
    ].join("\n");

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: gptPrompt }],
        max_tokens: 600,
        temperature: 0.4,
      });
      promptOpportunitySummary = completion.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      console.error("Failed to generate prompt opportunity summary:", err);
    }
  }

  // -----------------------------------------------------------------------
  // 2. platformPlaybooks
  // -----------------------------------------------------------------------

  // Compute cross-model average rank per prompt for gap detection
  const crossModelAvgRank: Record<string, number> = {};
  const promptRanksByModel: Record<string, Record<string, number[]>> = {};

  for (const run of runs) {
    const brandMetric = run.prominenceMetrics.find((m) => m.entityId === brand.slug);
    if (!brandMetric?.rankPosition) continue;
    const pid = run.promptId;
    if (!crossModelAvgRank[pid]) {
      crossModelAvgRank[pid] = 0;
    }
    if (!promptRanksByModel[pid]) promptRanksByModel[pid] = {};
    if (!promptRanksByModel[pid][run.model]) promptRanksByModel[pid][run.model] = [];
    promptRanksByModel[pid][run.model].push(brandMetric.rankPosition);
  }

  // Compute actual cross-model average per prompt
  const promptAllRanks: Record<string, number[]> = {};
  for (const run of runs) {
    const bm = run.prominenceMetrics.find((m) => m.entityId === brand.slug);
    if (bm?.rankPosition) {
      if (!promptAllRanks[run.promptId]) promptAllRanks[run.promptId] = [];
      promptAllRanks[run.promptId].push(bm.rankPosition);
    }
  }
  for (const [pid, ranks] of Object.entries(promptAllRanks)) {
    crossModelAvgRank[pid] = ranks.reduce((s, r) => s + r, 0) / ranks.length;
  }

  const platformPlaybooks: {
    model: string;
    avgBrandRank: number | null;
    mentionRate: number;
    topSourceCategories: { category: string; count: number }[];
    platformTip: string;
    specificGaps: { promptText: string; brandRankOnModel: number; crossModelAvg: number }[];
  }[] = [];

  for (const m of VALID_MODELS) {
    const modelRuns = runs.filter((r) => r.model === m);
    if (modelRuns.length === 0) {
      platformPlaybooks.push({
        model: m,
        avgBrandRank: null,
        mentionRate: 0,
        topSourceCategories: [],
        platformTip: PLATFORM_TIPS[m] ?? "",
        specificGaps: [],
      });
      continue;
    }

    // Avg brand rank on this model
    const ranks: number[] = [];
    let mentions = 0;
    for (const run of modelRuns) {
      const bm = run.prominenceMetrics.find((pm) => pm.entityId === brand.slug);
      if (bm) {
        mentions++;
        if (bm.rankPosition !== null) ranks.push(bm.rankPosition);
      }
    }
    const avgBrandRank = ranks.length > 0 ? ranks.reduce((s, r) => s + r, 0) / ranks.length : null;
    const mentionRate = modelRuns.length > 0 ? mentions / modelRuns.length : 0;

    // Top source categories for this model
    const catCounts: Record<string, number> = {};
    for (const run of modelRuns) {
      for (const so of run.sourceOccurrences) {
        const cat = so.source.category ?? "unknown";
        catCounts[cat] = (catCounts[cat] ?? 0) + 1;
      }
    }
    const topSourceCategories = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    // Specific gaps: prompts where brand ranks worse on this model than cross-model avg
    const specificGaps: { promptText: string; brandRankOnModel: number; crossModelAvg: number }[] = [];
    for (const run of modelRuns) {
      const bm = run.prominenceMetrics.find((pm) => pm.entityId === brand.slug);
      if (!bm?.rankPosition) continue;
      const avg = crossModelAvgRank[run.promptId];
      if (avg !== undefined && bm.rankPosition > avg + 0.5) {
        specificGaps.push({
          promptText: expandPrompt(run.prompt.text, run),
          brandRankOnModel: bm.rankPosition,
          crossModelAvg: Math.round(avg * 100) / 100,
        });
      }
    }
    specificGaps.sort((a, b) => (b.brandRankOnModel - b.crossModelAvg) - (a.brandRankOnModel - a.crossModelAvg));
    specificGaps.splice(10);

    platformPlaybooks.push({
      model: m,
      avgBrandRank: avgBrandRank !== null ? Math.round(avgBrandRank * 100) / 100 : null,
      mentionRate: Math.round(mentionRate * 1000) / 1000,
      topSourceCategories,
      platformTip: PLATFORM_TIPS[m] ?? "",
      specificGaps,
    });
  }

  // -----------------------------------------------------------------------
  // 3. negativeNarratives
  // -----------------------------------------------------------------------
  const weaknessCounts: Record<string, number> = {};
  const weaknessResponses: Record<string, { promptText: string; model: string; responsePreview: string; fullResponse: string }[]> = {};
  const themesBySentiment: Record<string, { positive: number; negative: number; neutral: number }> = {};

  for (const run of runs) {
    const narrative = parseNarrative(run.narrativeJson);
    if (!narrative) continue;

    for (const claim of narrative.claims) {
      if (claim.type === "weakness") {
        weaknessCounts[claim.text] = (weaknessCounts[claim.text] ?? 0) + 1;
        if (!weaknessResponses[claim.text]) weaknessResponses[claim.text] = [];
        weaknessResponses[claim.text].push({
          promptText: expandPrompt(run.prompt.text, run),
          model: run.model,
          responsePreview: run.rawResponseText.slice(0, 200).replace(/\s+/g, " ").trim(),
          fullResponse: run.rawResponseText,
        });
      }
    }
    const sentimentKey = narrative.sentiment.label === "POS" ? "positive" : narrative.sentiment.label === "NEG" ? "negative" : "neutral";
    for (const theme of narrative.themes) {
      if (!themesBySentiment[theme]) {
        themesBySentiment[theme] = { positive: 0, negative: 0, neutral: 0 };
      }
      themesBySentiment[theme][sentimentKey]++;
    }
  }

  const weaknesses = Object.entries(weaknessCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([weakness, count]) => ({
      weakness,
      count,
      responses: (weaknessResponses[weakness] ?? []).slice(0, 10),
      suggestion: buildWeaknessSuggestion(weakness),
    }));

  const negativeThemes = Object.entries(themesBySentiment)
    .filter(([, s]) => s.negative > (s.positive + s.neutral))
    .sort((a, b) => b[1].negative - a[1].negative)
    .slice(0, 10)
    .map(([theme, counts]) => ({
      theme,
      negativeCount: counts.negative,
      mixedCount: 0,
      positiveCount: counts.positive,
    }));

  // -----------------------------------------------------------------------
  // 3b. AI-generated narrative summary
  // -----------------------------------------------------------------------
  let narrativeSummary = "";
  if (weaknesses.length > 0 || negativeThemes.length > 0) {
    const weaknessLines = weaknesses.map(
      (w) => `- Weakness: "${w.weakness}" (mentioned in ${w.count} AI responses)`,
    );
    const themeLines = negativeThemes.map(
      (t) =>
        `- Negative theme: "${t.theme}" (${t.negativeCount} negative vs ${t.positiveCount} positive mentions)`,
    );
    const prompt = [
      `You are an AI visibility analyst writing for a marketing executive.`,
      `The brand is "${brandName}".`,
      `Below are the weaknesses and negative themes that AI platforms (ChatGPT, Gemini, Claude, Perplexity) associate with this brand.\n`,
      ...weaknessLines,
      ...themeLines,
      `\nWrite a concise summary (2-4 bullet points) that a marketing executive can quickly scan. Each bullet should:`,
      `- Clearly state the perception problem in plain language`,
      `- Note how widespread it is (reference the numbers)`,
      `- Suggest a concrete action to counter the narrative`,
      `Use the brand name "${brandName}" (not "you" or "your brand"). Do not use markdown formatting (no **, no #, no []()). Do not use headers or titles. Format each bullet as a line starting with "- " (a hyphen). Keep each bullet to 1-2 sentences.`,
    ].join("\n");

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.4,
      });
      narrativeSummary = completion.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      console.error("Failed to generate narrative summary:", err);
    }
  }

  // -----------------------------------------------------------------------
  // 4. competitorNarrativeGaps
  // -----------------------------------------------------------------------
  // Track prompts where each competitor outranks the brand, showing what they do better
  type GapPromptData = { competitorRank: number; brandRank: number | null; models: Set<string>; promptText: string };
  const competitorGapMap: Record<string, { promptCount: number; gapPrompts: Map<string, GapPromptData> }> = {};

  for (const run of runs) {
    const brandMetric = run.prominenceMetrics.find((m) => m.entityId === brand.slug);
    const brandRankPos = brandMetric?.rankPosition ?? null;

    for (const metric of run.prominenceMetrics) {
      if (metric.entityId === brand.slug) continue;
      if (metric.rankPosition === null) continue;

      // Competitor outranks brand (or brand not mentioned at all)
      if (brandRankPos === null || metric.rankPosition < brandRankPos) {
        if (!competitorGapMap[metric.entityId]) {
          competitorGapMap[metric.entityId] = { promptCount: 0, gapPrompts: new Map() };
        }
        competitorGapMap[metric.entityId].promptCount++;

        const promptText = expandPrompt(run.prompt.text, run);
        const existing = competitorGapMap[metric.entityId].gapPrompts.get(promptText);
        if (!existing || metric.rankPosition < existing.competitorRank) {
          competitorGapMap[metric.entityId].gapPrompts.set(promptText, {
            competitorRank: metric.rankPosition,
            brandRank: brandRankPos,
            models: existing ? new Set([...existing.models, run.model]) : new Set([run.model]),
            promptText,
          });
        } else if (existing) {
          existing.models.add(run.model);
        }
      }
    }
  }

  const competitorNarrativeGaps = Object.entries(competitorGapMap)
    .sort((a, b) => b[1].promptCount - a[1].promptCount)
    .slice(0, 10)
    .map(([entityId, data]) => {
      const gaps = [...data.gapPrompts.values()]
        .sort((a, b) => a.competitorRank - b.competitorRank)
        .slice(0, 5)
        .map((g) => ({
          promptText: g.promptText,
          competitorRank: g.competitorRank,
          brandRank: g.brandRank,
          models: [...g.models],
        }));

      return {
        entityId,
        displayName: resolveEntityName(entityId, entityDisplayNames),
        promptsWhereCompetitorOutranks: data.promptCount,
        outranksPercent: runs.length > 0 ? Math.round((data.promptCount / runs.length) * 1000) / 10 : 0,
        gaps,
      };
    })
    .filter((c) => c.promptsWhereCompetitorOutranks > 0);

  // -----------------------------------------------------------------------
  // 5. competitorAlerts — latest snapshot vs immediately previous snapshot
  // -----------------------------------------------------------------------
  // Uses analysisJson.competitors (the ranked competitor list) as the entity
  // source — matching CSV/export semantics. Does NOT use EntityResponseMetric.
  const rangeCutoff = new Date(Date.now() - viewRange * 86_400_000);
  const alertModelFilter = model !== "all" ? { model } : {};
  const alertJobs = await prisma.job.findMany({
    where: {
      brandId: brand.id,
      status: "done",
      finishedAt: { not: null, gte: rangeCutoff },
      ...alertModelFilter,
    },
    orderBy: { finishedAt: "asc" },
    select: { id: true, finishedAt: true },
  });

  // Fetch all industry runs for the scoped jobs
  const alertJobIds = alertJobs.filter((j) => j.finishedAt).map((j) => j.id);
  const alertRuns = alertJobIds.length > 0
    ? await prisma.run.findMany({
        where: { jobId: { in: alertJobIds }, prompt: { cluster: "industry" } },
        select: { id: true, model: true, jobId: true, analysisJson: true, rawResponseText: true, prompt: { select: { cluster: true } } },
      })
    : [];

  // Map jobId → date
  const alertJobDateMap = new Map<string, string>();
  for (const j of alertJobs) {
    if (j.finishedAt) alertJobDateMap.set(j.id, j.finishedAt.toISOString().slice(0, 10));
  }

  // Build MovementRun[] for the helper
  const movementRuns: MovementRun[] = alertRuns.map((r) => ({
    id: r.id,
    model: r.model,
    jobDate: alertJobDateMap.get(r.jobId) ?? "",
    cluster: r.prompt.cluster ?? "industry",
    analysisJson: r.analysisJson,
    rawResponseText: r.rawResponseText,
  }));

  // Collect all competitor names for alias normalization
  const allCompNames = new Set<string>();
  for (const r of movementRuns) {
    const analysis = r.analysisJson as { competitors?: { name: string }[] } | null;
    for (const c of (analysis?.competitors ?? [])) {
      allCompNames.add(c.name.toLowerCase());
    }
  }
  const brandAliasArr = brand.aliases?.length ? brand.aliases : undefined;
  const alertAliasMap = allCompNames.size > 0
    ? await normalizeEntityIds([...allCompNames].filter((id) => id !== brand.slug), brand.slug, brandAliasArr)
    : new Map<string, string>();

  // Update display names for canonical IDs
  for (const [entityId, canonical] of alertAliasMap) {
    if (entityId !== canonical && !entityDisplayNames.has(canonical)) {
      const aliasName = entityDisplayNames.get(entityId);
      if (aliasName) entityDisplayNames.set(canonical, aliasName);
    }
  }

  // Build snapshots from ranked competitor list (not EntityResponseMetric)
  const snapshots = buildMovementSnapshots(movementRuns, brandName, brand.slug, alertAliasMap);

  const alertResult = computeCompetitorAlerts(snapshots, brand.slug);
  let { comparisonPeriodLabel } = alertResult;

  // Map to the format expected by the UI (add displayName)
  const competitorAlerts = alertResult.alerts
    .slice(0, 15)
    .map((a) => ({
      entityId: a.entityId,
      displayName: resolveEntityName(a.entityId, entityDisplayNames),
      mentionRateChange: a.mentionRateChange,
      recentMentionRate: a.recentMentionRate,
      previousMentionRate: a.previousMentionRate,
      direction: a.direction,
    }));

  // ── GPT-based relevance filter: keep only same-industry competitors ────
  if (competitorAlerts.length > 0) {
    const industryLabel = brand.industry || `${brandName}'s industry`;
    const candidateNames = competitorAlerts.map((c) => c.displayName);
    try {
      const client = getOpenAIDefault();
      const filterResp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: `You are a competitive-intelligence filter. Given a brand and its industry, decide which candidate names are direct competitors, peers, or organizations in the SAME industry or sector. Return ONLY a JSON array of the names that belong. Exclude names from unrelated industries. If unsure, include the name.`,
          },
          {
            role: "user",
            content: `Brand: "${brandName}"\nIndustry: "${industryLabel}"\n${isOrg ? "This is a political/advocacy organization. Include other political parties, PACs, advocacy groups, and political organizations. Exclude commercial brands unless they are politically active.\n" : ""}Candidates: ${JSON.stringify(candidateNames)}`,
          },
        ],
      });
      const raw = filterResp.choices[0]?.message?.content?.trim() ?? "[]";
      const cleaned = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      const keepSet = new Set<string>(JSON.parse(cleaned) as string[]);
      for (let i = competitorAlerts.length - 1; i >= 0; i--) {
        if (!keepSet.has(competitorAlerts[i].displayName)) {
          competitorAlerts.splice(i, 1);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[competitorAlerts] GPT filter failed, keeping all:", err);
    }
  }

  // -----------------------------------------------------------------------
  // 6. sourceGapOpportunities
  // -----------------------------------------------------------------------
  const domainEntities: Record<string, { category: string | null; entities: Set<string>; total: number }> = {};

  for (const run of runs) {
    for (const so of run.sourceOccurrences) {
      const domain = so.source.domain;
      if (!domainEntities[domain]) {
        domainEntities[domain] = { category: so.source.category, entities: new Set(), total: 0 };
      }
      domainEntities[domain].total++;
      if (so.entityId) domainEntities[domain].entities.add(so.entityId);
    }
  }

  const sourceGapOpportunities: {
    domain: string;
    category: string | null;
    competitorsCited: string[];
    totalCitations: number;
    suggestion: string;
  }[] = [];

  for (const [domain, data] of Object.entries(domainEntities)) {
    if (data.entities.has(brand.slug)) continue; // Brand is already cited
    const competitors = [...data.entities].filter((e) => e !== brand.slug);
    if (competitors.length === 0) continue;

    const compNames = competitors.slice(0, 5).map((e) => resolveEntityName(e, entityDisplayNames)).join(", ");
    sourceGapOpportunities.push({
      domain,
      category: data.category,
      competitorsCited: competitors.map((e) => resolveEntityName(e, entityDisplayNames)),
      totalCitations: data.total,
      suggestion: `Get coverage on ${domain}${data.category ? ` (${data.category})` : ""} \u2014 currently cites ${compNames} but not ${brandName}`,
    });
  }

  sourceGapOpportunities.sort((a, b) => b.totalCitations - a.totalCitations);
  sourceGapOpportunities.splice(15);

  // -----------------------------------------------------------------------
  // 7. topicCoverageGaps
  // -----------------------------------------------------------------------
  const topicData: Record<
    string,
    { totalRuns: number; mentions: number; ranks: number[]; entityRank1: Record<string, number> }
  > = {};

  for (const run of runs) {
    const topicKey = run.prompt.topicKey;
    if (!topicKey) continue;

    if (!topicData[topicKey]) {
      topicData[topicKey] = { totalRuns: 0, mentions: 0, ranks: [], entityRank1: {} };
    }
    topicData[topicKey].totalRuns++;

    const brandMetric = run.prominenceMetrics.find((m) => m.entityId === brand.slug);
    if (brandMetric) {
      topicData[topicKey].mentions++;
      if (brandMetric.rankPosition !== null) topicData[topicKey].ranks.push(brandMetric.rankPosition);
    }

    // Track who ranks #1
    const rank1 = run.prominenceMetrics
      .filter((m) => m.rankPosition === 1 && m.entityId !== brand.slug)
      .map((m) => m.entityId);
    for (const eid of rank1) {
      topicData[topicKey].entityRank1[eid] = (topicData[topicKey].entityRank1[eid] ?? 0) + 1;
    }
  }

  const topicCoverageGaps: {
    topicKey: string;
    mentionRate: number;
    avgRank: number | null;
    competitorLeaders: { entityId: string; displayName: string; rank1Count: number }[];
    suggestion: string;
  }[] = [];

  for (const [topicKey, data] of Object.entries(topicData)) {
    const mentionRate = data.totalRuns > 0 ? data.mentions / data.totalRuns : 0;
    const avgRank = data.ranks.length > 0 ? data.ranks.reduce((s, r) => s + r, 0) / data.ranks.length : null;

    if (mentionRate < 0.5 || (avgRank !== null && avgRank > 3)) {
      const competitorLeaders = Object.entries(data.entityRank1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([entityId, rank1Count]) => ({
          entityId,
          displayName: resolveEntityName(entityId, entityDisplayNames),
          rank1Count,
        }));

      const pct = Math.round(mentionRate * 100);
      topicCoverageGaps.push({
        topicKey,
        mentionRate: Math.round(mentionRate * 1000) / 1000,
        avgRank: avgRank !== null ? Math.round(avgRank * 100) / 100 : null,
        competitorLeaders,
        suggestion: `Improve visibility for "${topicKey}" \u2014 currently mentioned in only ${pct}% of responses`,
      });
    }
  }

  topicCoverageGaps.sort((a, b) => a.mentionRate - b.mentionRate);
  topicCoverageGaps.splice(15);

  // -----------------------------------------------------------------------
  // 8. decliningMetrics
  // -----------------------------------------------------------------------
  const sortedRuns = [...runs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const midIdx = Math.floor(sortedRuns.length / 2);
  const earlierRuns = sortedRuns.slice(0, midIdx);
  const recentRuns = sortedRuns.slice(midIdx);

  function computeHalfMetrics(halfRuns: RecommendationRun[]) {
    let mentions = 0;
    const ranks: number[] = [];
    const perModel: Record<string, { mentions: number; total: number; ranks: number[] }> = {};

    for (const run of halfRuns) {
      const bm = run.prominenceMetrics.find((m) => m.entityId === brand.slug);
      if (bm) {
        mentions++;
        if (bm.rankPosition !== null) ranks.push(bm.rankPosition);
      }
      if (!perModel[run.model]) perModel[run.model] = { mentions: 0, total: 0, ranks: [] };
      perModel[run.model].total++;
      if (bm) {
        perModel[run.model].mentions++;
        if (bm.rankPosition !== null) perModel[run.model].ranks.push(bm.rankPosition);
      }
    }

    return {
      mentionRate: halfRuns.length > 0 ? mentions / halfRuns.length : 0,
      avgRank: ranks.length > 0 ? ranks.reduce((s, r) => s + r, 0) / ranks.length : null,
      perModel,
    };
  }

  const earlierMetrics = computeHalfMetrics(earlierRuns);
  const recentMetrics = computeHalfMetrics(recentRuns);

  // Compute date labels for each half
  const earlierStart = earlierRuns.length > 0 ? earlierRuns[0].createdAt.toISOString().slice(0, 10) : "";
  const earlierEnd = earlierRuns.length > 0 ? earlierRuns[earlierRuns.length - 1].createdAt.toISOString().slice(0, 10) : "";
  const recentStart = recentRuns.length > 0 ? recentRuns[0].createdAt.toISOString().slice(0, 10) : "";
  const recentEnd = recentRuns.length > 0 ? recentRuns[recentRuns.length - 1].createdAt.toISOString().slice(0, 10) : "";

  const decliningMetrics: {
    metric: string;
    recentValue: number;
    previousValue: number;
    change: number;
    direction: "improving" | "declining" | "stable";
    model?: string;
    previousPeriod: string;
    recentPeriod: string;
  }[] = [];

  // Overall metrics
  const metricPairs: { name: string; recent: number | null; previous: number | null; lowerIsBetter?: boolean }[] = [
    { name: "mentionRate", recent: recentMetrics.mentionRate, previous: earlierMetrics.mentionRate },
    { name: "avgRank", recent: recentMetrics.avgRank, previous: earlierMetrics.avgRank, lowerIsBetter: true },
  ];

  for (const { name, recent, previous, lowerIsBetter } of metricPairs) {
    if (recent === null || previous === null) continue;
    const change = recent - previous;
    const isImproving = lowerIsBetter ? change < -0.05 : change > 0.05;
    const isDeclining = lowerIsBetter ? change > 0.05 : change < -0.05;
    const direction: "improving" | "declining" | "stable" = isImproving
      ? "improving"
      : isDeclining
        ? "declining"
        : "stable";

    if (isDeclining || Math.abs(change) > 0.05) {
      decliningMetrics.push({
        metric: name,
        recentValue: Math.round(recent * 1000) / 1000,
        previousValue: Math.round(previous * 1000) / 1000,
        change: Math.round(change * 1000) / 1000,
        direction,
        previousPeriod: `${earlierStart} – ${earlierEnd}`,
        recentPeriod: `${recentStart} – ${recentEnd}`,
      });
    }
  }

  // Per-model breakdown
  const allModels = new Set([
    ...Object.keys(earlierMetrics.perModel),
    ...Object.keys(recentMetrics.perModel),
  ]);

  for (const m of allModels) {
    const earlier = earlierMetrics.perModel[m];
    const recent = recentMetrics.perModel[m];
    if (!earlier || !recent || earlier.total === 0 || recent.total === 0) continue;

    const earlierRate = earlier.mentions / earlier.total;
    const recentRate = recent.mentions / recent.total;
    const change = recentRate - earlierRate;

    if (change < -0.05) {
      decliningMetrics.push({
        metric: "mentionRate",
        recentValue: Math.round(recentRate * 1000) / 1000,
        previousValue: Math.round(earlierRate * 1000) / 1000,
        change: Math.round(change * 1000) / 1000,
        direction: "declining",
        model: m,
        previousPeriod: `${earlierStart} – ${earlierEnd}`,
        recentPeriod: `${recentStart} – ${recentEnd}`,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Response
  // -----------------------------------------------------------------------
  return NextResponse.json({
    hasData: true,
    brandName: brandName,
    promptOpportunities,
    promptOpportunitySummary,
    platformPlaybooks,
    negativeNarratives: { weaknesses, negativeThemes, narrativeSummary },
    competitorNarrativeGaps,
    competitorAlerts,
    comparisonPeriodLabel,
    sourceGapOpportunities,
    topicCoverageGaps,
    decliningMetrics,
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
  });
}
