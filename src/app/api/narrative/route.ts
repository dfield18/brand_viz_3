import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import { parseAnalysis, aggregateNarrative } from "@/lib/aggregateAnalysis";
import type { NarrativeExtractionResult } from "@/lib/narrative/extractNarrative";
import { computeDrift, type DriftBucket } from "@/lib/narrative/drift";
import { THEME_TAXONOMY } from "@/lib/narrative/themeTaxonomy";
import { validateFrames } from "@/lib/validateFrames";

// Static fallback labels for older runs with keyword-based themes
const STATIC_THEME_LABELS: Record<string, string> = {};
for (const t of THEME_TAXONOMY) {
  STATIC_THEME_LABELS[t.key] = t.label;
}

function parseNarrative(json: unknown): NarrativeExtractionResult | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  if (!obj.sentiment || !Array.isArray(obj.themes)) return null;
  return json as NarrativeExtractionResult;
}

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10);

  try {
  type NarrativeRun = {
    id: string;
    analysisJson: unknown;
    narrativeJson: unknown;
    rawResponseText: string;
    promptId: string;
    model: string;
    createdAt: Date;
    prompt: { text: string };
  };
  const result = await fetchBrandRuns<NarrativeRun>({
    brandSlug,
    model,
    viewRange,
    runQuery: {
      select: {
        id: true,
        analysisJson: true,
        narrativeJson: true,
        rawResponseText: true,
        promptId: true,
        model: true,
        createdAt: true,
        prompt: { select: { text: true } },
      },
    },
  });
  if (!result.ok) return result.response;
  const { brand, job, runs, isAll, rangeCutoff } = result;
  const brandName = brand.displayName || brand.name;

  const analyses = runs
    .map((r) => parseAnalysis(r.analysisJson))
    .filter((a): a is NonNullable<typeof a> => a !== null);

  if (analyses.length === 0) {
    return NextResponse.json({
      hasData: false,
      reason: "no_analysis_data",
      hint: "Runs exist but were created before structured extraction. Re-run prompts to generate analysis.",
    });
  }

  const narrativeBase = aggregateNarrative(analyses, brand.name, isAll ? "all" : model);

  // Fix byModel: compute per-model frame frequency (% of model's responses containing frame)
  {
    const STRENGTH_THRESHOLD = 20;
    const modelRunCounts: Record<string, number> = {};
    const modelFrameCounts: Record<string, Record<string, number>> = {};
    for (const r of runs) {
      const a = parseAnalysis(r.analysisJson);
      if (!a) continue;
      modelRunCounts[r.model] = (modelRunCounts[r.model] ?? 0) + 1;
      if (!modelFrameCounts[r.model]) modelFrameCounts[r.model] = {};
      for (const f of a.frames) {
        if (f.strength >= STRENGTH_THRESHOLD) {
          modelFrameCounts[r.model][f.name] = (modelFrameCounts[r.model][f.name] ?? 0) + 1;
        }
      }
    }
    // Patch each frame's byModel with frequency percentages
    for (const frame of narrativeBase.frames) {
      frame.byModel = {
        chatgpt: modelRunCounts["chatgpt"] ? Math.round(((modelFrameCounts["chatgpt"]?.[frame.frame] ?? 0) / modelRunCounts["chatgpt"]) * 100) : 0,
        gemini: modelRunCounts["gemini"] ? Math.round(((modelFrameCounts["gemini"]?.[frame.frame] ?? 0) / modelRunCounts["gemini"]) * 100) : 0,
        claude: modelRunCounts["claude"] ? Math.round(((modelFrameCounts["claude"]?.[frame.frame] ?? 0) / modelRunCounts["claude"]) * 100) : 0,
        perplexity: modelRunCounts["perplexity"] ? Math.round(((modelFrameCounts["perplexity"]?.[frame.frame] ?? 0) / modelRunCounts["perplexity"]) * 100) : 0,
        google: modelRunCounts["google"] ? Math.round(((modelFrameCounts["google"]?.[frame.frame] ?? 0) / modelRunCounts["google"]) * 100) : 0,
      };
    }
  }

  // Validate frames: filter out generic jargon, replace with specific issues
  narrativeBase.frames = await validateFrames(narrativeBase.frames, brandName);

  // --- Aggregate narrativeJson data ---
  const narratives = runs
    .map((r) => ({ parsed: parseNarrative(r.narrativeJson), run: r }))
    .filter((n): n is { parsed: NarrativeExtractionResult; run: typeof runs[number] } => n.parsed !== null);

  const narrativeCount = narratives.length;

  // Sentiment split
  let posCount = 0, neuCount = 0, negCount = 0;
  for (const { parsed } of narratives) {
    if (parsed.sentiment.label === "POS") posCount++;
    else if (parsed.sentiment.label === "NEG") negCount++;
    else neuCount++;
  }
  const sentimentSplit = narrativeCount > 0
    ? {
        positive: Math.round((posCount / narrativeCount) * 100),
        neutral: Math.round((neuCount / narrativeCount) * 100),
        negative: Math.round((negCount / narrativeCount) * 100),
      }
    : undefined;

  // Signal rates
  const authorityRate = narrativeCount > 0
    ? Math.round((narratives.filter((n) => n.parsed.authoritySignals >= 1).length / narrativeCount) * 100)
    : undefined;
  const trustRate = narrativeCount > 0
    ? Math.round((narratives.filter((n) => n.parsed.trustSignals >= 1).length / narrativeCount) * 100)
    : undefined;
  const weaknessRate = narrativeCount > 0
    ? Math.round((narratives.filter((n) => n.parsed.weaknessSignals >= 1).length / narrativeCount) * 100)
    : undefined;

  // Themes: merge + sum counts across runs, track contributing prompts with counts
  // Build dynamic label map from stored narrative data (GPT-extracted labels)
  const dynamicThemeLabels: Record<string, string> = {};
  const themeCounts: Record<string, number> = {};
  const themePromptCounts: Record<string, Map<string, number>> = {};
  for (const { parsed, run } of narratives) {
    const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
    for (const theme of parsed.themes) {
      // Prefer the stored label (from GPT extraction) over static fallback
      if (theme.label && !dynamicThemeLabels[theme.key]) {
        dynamicThemeLabels[theme.key] = theme.label;
      }
      themeCounts[theme.key] = (themeCounts[theme.key] || 0) + 1;
      if (!themePromptCounts[theme.key]) themePromptCounts[theme.key] = new Map();
      const pm = themePromptCounts[theme.key];
      pm.set(promptText, (pm.get(promptText) ?? 0) + 1);
    }
  }
  // Merge: dynamic labels take priority, static taxonomy as fallback
  const themeLabels = { ...STATIC_THEME_LABELS, ...dynamicThemeLabels };
  const totalThemeHits = Object.values(themeCounts).reduce((s, v) => s + v, 0);
  const themes = Object.entries(themeCounts)
    .map(([key, count]) => {
      const pm = themePromptCounts[key] ?? new Map<string, number>();
      const prompts = [...pm.entries()]
        .map(([text, c]) => ({ text, pct: Math.round((c / count) * 100) }))
        .sort((a, b) => b.pct - a.pct);
      return {
        key,
        label: themeLabels[key] ?? key,
        count,
        pct: totalThemeHits > 0 ? Math.round((count / totalThemeHits) * 100) : 0,
        prompts,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Polarization: qualitative label based on sentiment distribution
  const polarization: "Low" | "Moderate" | "High" = (() => {
    if (narrativeCount === 0) return "Low";
    const pos = posCount / narrativeCount;
    const neg = negCount / narrativeCount;
    const minSide = Math.min(pos, neg);
    // High: both positive and negative are significant (each ≥ 15%)
    if (minSide >= 0.15) return "High";
    // Moderate: the minority side is noticeable (≥ 5%)
    if (minSide >= 0.05) return "Moderate";
    return "Low";
  })();

  // Descriptors: merge + sum
  const descriptorCounts: Record<string, { polarity: "positive" | "negative" | "neutral"; count: number }> = {};
  for (const { parsed } of narratives) {
    for (const desc of parsed.descriptors) {
      if (!descriptorCounts[desc.word]) {
        descriptorCounts[desc.word] = { polarity: desc.polarity, count: 0 };
      }
      descriptorCounts[desc.word].count += desc.count;
    }
  }
  const descriptors = Object.entries(descriptorCounts)
    .map(([word, { polarity, count }]) => ({ word, polarity, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Strengths + Weaknesses: merge + deduplicate, top 5 each
  // Track source model + prompt for each claim
  type ClaimEntry = { count: number; model: string; prompt: string };
  const strengthMap: Record<string, ClaimEntry> = {};
  const weaknessMap: Record<string, ClaimEntry> = {};
  const neutralMap: Record<string, ClaimEntry> = {};
  for (const { parsed, run } of narratives) {
    const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
    for (const claim of parsed.claims) {
      const map = claim.type === "strength" ? strengthMap
        : claim.type === "weakness" ? weaknessMap
        : neutralMap;
      const key = claim.text.toLowerCase();
      if (!map[key]) {
        map[key] = { count: 0, model: run.model, prompt: promptText };
      }
      map[key].count++;
    }
  }
  const strengths = Object.entries(strengthMap)
    .map(([text, { count, model: m, prompt: p }]) => ({ text, count, model: m, prompt: p }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const weaknessCandidates = Object.entries(weaknessMap)
    .map(([text, { count, model: m, prompt: p }]) => ({ text, count, model: m, prompt: p }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  // Fall back to neutral mentions when no weaknesses detected
  const weaknesses = weaknessCandidates.length > 0
    ? weaknessCandidates
    : Object.entries(neutralMap)
        .map(([text, { count, model: m, prompt: p }]) => ({ text, count, model: m, prompt: p }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

  // Drift: group ALL runs (not just latest per prompt) by week → theme counts per week
  // Fetch runs with narrativeJson for drift/sentiment (strict)
  const driftRunWhere = isAll
    ? { brandId: brand.id, createdAt: { gte: rangeCutoff }, narrativeJson: { not: Prisma.DbNull } }
    : { brandId: brand.id, model, createdAt: { gte: rangeCutoff }, narrativeJson: { not: Prisma.DbNull } };
  const driftRuns = await prisma.run.findMany({
    where: driftRunWhere,
    select: { narrativeJson: true, analysisJson: true, createdAt: true, model: true },
    orderBy: { createdAt: "asc" },
  });

  // Also fetch ALL runs with analysisJson for frame trend + sentiment fallback
  // (older runs may have analysisJson but no narrativeJson)
  const allTrendRunWhere = isAll
    ? { brandId: brand.id, createdAt: { gte: rangeCutoff }, analysisJson: { not: Prisma.DbNull } }
    : { brandId: brand.id, model, createdAt: { gte: rangeCutoff }, analysisJson: { not: Prisma.DbNull } };
  const allTrendRuns = await prisma.run.findMany({
    where: allTrendRunWhere,
    select: { narrativeJson: true, analysisJson: true, createdAt: true, model: true },
    orderBy: { createdAt: "asc" },
  });

  const weekBuckets: Record<string, Record<string, number>> = {};
  for (const dr of driftRuns) {
    const parsed = parseNarrative(dr.narrativeJson);
    if (!parsed) continue;
    // Week key: ISO date of Monday
    const d = new Date(dr.createdAt);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);
    if (!weekBuckets[weekKey]) weekBuckets[weekKey] = {};
    for (const theme of parsed.themes) {
      weekBuckets[weekKey][theme.key] = (weekBuckets[weekKey][theme.key] || 0) + 1;
    }
  }
  const driftBuckets: DriftBucket[] = Object.entries(weekBuckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, themeCounts]) => ({ date, themeCounts }));
  const drift = computeDrift(driftBuckets, themeLabels);

  // Sentiment trend: group by (week, model) → average sentiment score scaled to 0-100
  // Uses allTrendRuns so older runs without narrativeJson still contribute via analysisJson fallback
  const sentimentBuckets: Record<string, Record<string, { sum: number; count: number }>> = {};
  for (const dr of allTrendRuns) {
    const narr = parseNarrative(dr.narrativeJson);
    const analysis = parseAnalysis(dr.analysisJson);
    // Derive a -1 to 1 sentiment score from whichever source is available
    let score: number | null = null;
    if (narr) {
      score = narr.sentiment.label === "POS" ? narr.sentiment.score
        : narr.sentiment.label === "NEG" ? -narr.sentiment.score
        : 0;
    } else if (analysis) {
      // Fallback: use legitimacy (0-100) → scale to -1..1 (50 = neutral)
      score = (analysis.sentiment.legitimacy - 50) / 50;
    }
    if (score === null) continue;

    const d = new Date(dr.createdAt);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);
    if (!sentimentBuckets[weekKey]) sentimentBuckets[weekKey] = {};
    // Per-model bucket
    if (!sentimentBuckets[weekKey][dr.model]) sentimentBuckets[weekKey][dr.model] = { sum: 0, count: 0 };
    sentimentBuckets[weekKey][dr.model].sum += score;
    sentimentBuckets[weekKey][dr.model].count++;
    // "all" aggregate bucket
    if (!sentimentBuckets[weekKey]["all"]) sentimentBuckets[weekKey]["all"] = { sum: 0, count: 0 };
    sentimentBuckets[weekKey]["all"].sum += score;
    sentimentBuckets[weekKey]["all"].count++;
  }
  const sentimentTrend = Object.entries(sentimentBuckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, models]) =>
      Object.entries(models).map(([m, { sum, count }]) => {
        const avg = count > 0 ? sum / count : 0; // -1 to 1
        return {
          date,
          model: m,
          positive: Math.round((avg + 1) * 50), // scale to 0-100 (50 = neutral)
        };
      }),
    );

  // Frame trend: group by (week, model) with "all" aggregate
  // Uses allTrendRuns so older runs without narrativeJson still contribute
  const frameWeekModelBuckets: Record<string, Record<string, Record<string, number[]>>> = {};
  for (const dr of allTrendRuns) {
    const a = parseAnalysis(dr.analysisJson);
    if (!a || a.frames.length === 0) continue;
    const d = new Date(dr.createdAt);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);
    if (!frameWeekModelBuckets[weekKey]) frameWeekModelBuckets[weekKey] = {};
    for (const m of [dr.model, "all"]) {
      if (!frameWeekModelBuckets[weekKey][m]) frameWeekModelBuckets[weekKey][m] = {};
      for (const f of a.frames) {
        if (f.strength >= 20) {
          (frameWeekModelBuckets[weekKey][m][f.name] ??= []).push(f.strength);
        }
      }
    }
  }

  // Track run counts per week/model for frequency calculation
  const weekModelRunCounts: Record<string, Record<string, number>> = {};
  for (const dr of allTrendRuns) {
    const a = parseAnalysis(dr.analysisJson);
    if (!a) continue;
    const d = new Date(dr.createdAt);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);
    if (!weekModelRunCounts[weekKey]) weekModelRunCounts[weekKey] = {};
    for (const m of [dr.model, "all"]) {
      weekModelRunCounts[weekKey][m] = (weekModelRunCounts[weekKey][m] ?? 0) + 1;
    }
  }

  // Collect all frame names across weeks
  const allFrameNames = new Set<string>();
  for (const models of Object.values(frameWeekModelBuckets)) {
    for (const buckets of Object.values(models)) {
      for (const name of Object.keys(buckets)) allFrameNames.add(name);
    }
  }
  const frameTrend: Record<string, string | number>[] = [];
  for (const [date, models] of Object.entries(frameWeekModelBuckets).sort(([a], [b]) => a.localeCompare(b))) {
    for (const [m, frameBuckets] of Object.entries(models)) {
      const runCount = weekModelRunCounts[date]?.[m] ?? 1;
      const entry: Record<string, string | number> = { date, model: m };
      for (const name of allFrameNames) {
        const strengths = frameBuckets[name];
        // Frequency: % of responses in this week/model that contain this frame
        entry[name] = strengths ? Math.round((strengths.length / runCount) * 100) : 0;
      }
      frameTrend.push(entry);
    }
  }

  // Examples: runs with most theme hits, 200-char excerpt
  const examples = narratives
    .filter((n) => n.parsed.themes.length > 0)
    .sort((a, b) => b.parsed.themes.length - a.parsed.themes.length)
    .slice(0, 20)
    .map(({ parsed, run }) => ({
      prompt: run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`),
      excerpt: run.rawResponseText
        .replace(/\*\*/g, "")           // remove bold markdown
        .replace(/\*/g, "")             // remove italic markdown
        .replace(/^#+\s+/gm, "")        // remove heading markers
        .replace(/^[-*•]\s+/gm, "")     // remove bullet markers at line start
        .replace(/^\d+\.\s+/gm, "")     // remove numbered list markers
        .replace(/\n+/g, " ")           // collapse newlines to spaces
        .replace(/\s{2,}/g, " ")        // collapse multiple spaces
        .trim()
        .slice(0, 200),
      themes: parsed.themes.map((t) => t.label),
      sentiment: parsed.sentiment.label,
      model: run.model,
    }));

  // Sentiment by Question: group by prompt, compute count + dominant sentiment
  const promptSentimentMap = new Map<string, { mentions: number; scores: number[] }>();
  for (const { parsed, run } of narratives) {
    const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
    if (!promptSentimentMap.has(promptText)) {
      promptSentimentMap.set(promptText, { mentions: 0, scores: [] });
    }
    const entry = promptSentimentMap.get(promptText)!;
    entry.mentions++;
    // Map POS/NEU/NEG + score to a numeric scale
    const rawScore = parsed.sentiment.score;
    const numericScore = parsed.sentiment.label === "POS" ? rawScore
      : parsed.sentiment.label === "NEG" ? -rawScore
      : 0;
    entry.scores.push(numericScore);
  }
  const sentimentByQuestion = [...promptSentimentMap.entries()].map(([prompt, { mentions, scores }]) => {
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    let sentiment: "Strong" | "Positive" | "Neutral" | "Conditional" | "Negative";
    if (avg >= 0.5) sentiment = "Strong";
    else if (avg >= 0.15) sentiment = "Positive";
    else if (avg >= -0.15) sentiment = "Neutral";
    else if (avg >= -0.4) sentiment = "Conditional";
    else sentiment = "Negative";
    const mentionRate = narrativeCount > 0 ? Math.round((mentions / narrativeCount) * 100) : 0;
    // Consistency: 100 − normalized std deviation (scores range -1 to 1, so max std dev ≈ 1)
    const variance = scores.length > 1
      ? scores.reduce((sum, s) => sum + (s - avg) ** 2, 0) / scores.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const consistency = Math.round(Math.max(0, (1 - stdDev) * 100));
    return { prompt, mentions, mentionRate, consistency, sentiment, sentimentScore: Math.round(avg * 100) / 100 };
  });

  // --- Month-over-month deltas ---
  // Sentiment delta: compare most recent "all" trend point to the one closest to 30 days prior
  let narrativeDeltas: { sentimentPositive: number; confidence: number } | null = null;
  {
    const allSentimentPoints = sentimentTrend
      .filter((t) => t.model === "all")
      .sort((a, b) => a.date.localeCompare(b.date));

    if (allSentimentPoints.length >= 2) {
      const current = allSentimentPoints[allSentimentPoints.length - 1];
      const lastDate = new Date(current.date + "T00:00:00").getTime();
      const targetDate = lastDate - 30 * 86_400_000;
      let closest = allSentimentPoints[0];
      let closestDist = Infinity;
      for (const pt of allSentimentPoints.slice(0, -1)) {
        const dist = Math.abs(new Date(pt.date + "T00:00:00").getTime() - targetDate);
        if (dist < closestDist) { closestDist = dist; closest = pt; }
      }
      const sentimentDelta = current.positive - closest.positive;

      // Confidence delta: split driftRuns into two periods, compute hedging rate each
      const splitDate = new Date(targetDate);
      const recentNarrativeRuns = driftRuns.filter((r) => r.createdAt >= splitDate);
      const priorNarrativeRuns = driftRuns.filter((r) => r.createdAt < splitDate);

      const hedgingFor = (runs: typeof driftRuns) => {
        let total = 0, hedged = 0;
        for (const r of runs) {
          const p = parseNarrative(r.narrativeJson);
          if (!p) continue;
          total++;
          // hedging = has cautious language markers
          if (p.trustSignals === 0 && p.authoritySignals === 0) hedged++;
        }
        return total > 0 ? Math.round((hedged / total) * 100) : 0;
      };
      const currentConfidence = 100 - hedgingFor(recentNarrativeRuns);
      const priorConfidence = 100 - hedgingFor(priorNarrativeRuns);

      narrativeDeltas = {
        sentimentPositive: sentimentDelta,
        confidence: currentConfidence - priorConfidence,
      };
    }
  }

  // Merge enhanced data into narrative response
  const narrative = {
    ...narrativeBase,
    ...(narrativeCount > 0
      ? {
          sentimentSplit,
          authorityRate,
          trustRate,
          weaknessRate,
          polarization,
          themes,
          descriptors,
          strengths,
          weaknesses,
          weaknessesAreNeutral: weaknessCandidates.length === 0 && weaknesses.length > 0,
          drift,
          sentimentTrend,
          frameTrend,
          examples,
          sentimentByQuestion,
        }
      : {}),
  };

  return NextResponse.json({
    hasData: true,
    job: formatJobMeta(job!),
    narrative,
    narrativeDeltas,
    totals: { totalRuns: runs.length, analyzedRuns: analyses.length },
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
  });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Narrative API error:", message, e instanceof Error ? e.stack : "");
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
