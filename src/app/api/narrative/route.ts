import { NextRequest, NextResponse } from "next/server";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import { requireBrandAccess, brandCacheControl } from "@/lib/brandAccess";
import { parseAnalysis, aggregateNarrative } from "@/lib/aggregateAnalysis";
import type { NarrativeExtractionResult } from "@/lib/narrative/extractNarrative";
import { computeDrift, type DriftBucket } from "@/lib/narrative/drift";
import { THEME_TAXONOMY } from "@/lib/narrative/themeTaxonomy";
import { validateFrames } from "@/lib/validateFrames";
import { synthesizeFramesFromResponses, ensureMinimumFrames } from "@/lib/narrative/synthesizeFrames";
import { expandPromptPlaceholders } from "@/lib/utils";
import { getOpenAIDefault } from "@/lib/openai";
import { splitSentences, getEntityContextWindow, isSourceOrJunkClaim } from "@/lib/narrative/textUtils";
import { isRunInBrandScope, filterRunsToBrandScope, buildBrandIdentity } from "@/lib/visibility/brandScope";

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

// Server-side response cache: avoids re-running GPT calls when underlying data hasn't changed
const narrativeCache = new Map<string, { response: unknown; runCount: number; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const access = await requireBrandAccess(brandSlug);
  if (access) return access;
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
    prompt: { text: string; cluster: string };
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
        prompt: { select: { text: true, cluster: true } },
      },
    },
  });
  if (!result.ok) return result.response;
  const { brand, job, runs: rawRuns, isAll } = result;
  const brandName = brand.displayName || brand.name;
  const brandIdentity = buildBrandIdentity(brand);

  // Brand-scope filter: exclude runs about unrelated entities sharing the brand phrase
  const allScopedRuns = filterRunsToBrandScope(rawRuns, brandIdentity);

  // Check server-side cache: if run count hasn't changed and cache is fresh, return cached response
  const cacheKey = `${brandSlug}|${model}|${viewRange}`;
  const cached = narrativeCache.get(cacheKey);
  if (cached && cached.runCount === allScopedRuns.length && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.response, {
      headers: { "Cache-Control": brandCacheControl(brandSlug) },
    });
  }

  // One consistent narrative run pool: prefer industry-cluster when available,
  // fall back to all scoped runs. This pool is used for frames, sentiment,
  // themes, strengths/weaknesses, and examples.
  const industryRuns = allScopedRuns.filter((r) => r.prompt.cluster === "industry");
  const runs = industryRuns.length > 0 ? industryRuns : allScopedRuns;

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

  // Aggregate frames from the unified scoped run pool
  const narrativeBase = aggregateNarrative(
    analyses,
    brand.name,
    isAll ? "all" : model,
  );

  // Fix byModel + build frame→runId mapping for example quotes
  // Track which exact run IDs contributed to each frame name during aggregation
  const frameRunIds = new Map<string, { runId: string; strength: number }[]>();
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
          // Track this run as a contributor to this exact frame name
          if (!frameRunIds.has(f.name)) frameRunIds.set(f.name, []);
          frameRunIds.get(f.name)!.push({ runId: r.id, strength: f.strength });
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
  // Track original names before validation so we can update frameRunIds
  const preValidationNames = narrativeBase.frames.map((f: { frame: string }) => f.frame);
  narrativeBase.frames = await validateFrames(narrativeBase.frames, brandName);
  // Update frameRunIds keys for any renamed frames
  for (let i = 0; i < preValidationNames.length && i < narrativeBase.frames.length; i++) {
    const oldName = preValidationNames[i];
    const newName = (narrativeBase.frames[i] as { frame: string }).frame;
    if (oldName !== newName && frameRunIds.has(oldName) && !frameRunIds.has(newName)) {
      frameRunIds.set(newName, frameRunIds.get(oldName)!);
    }
  }

  // Fallback: if frames are empty after aggregation + validation, synthesize from raw responses
  if (narrativeBase.frames.length === 0 && runs.length > 0) {
    narrativeBase.frames = await synthesizeFramesFromResponses(
      runs.map((r) => ({ rawResponseText: r.rawResponseText, model: r.model })),
      brandName,
      isAll ? "all" : model,
    );
  }

  // Ensure at least 5 frames — pad with GPT-generated frames if needed
  narrativeBase.frames = await ensureMinimumFrames(
    narrativeBase.frames,
    brandName,
    runs.map((r) => ({ rawResponseText: r.rawResponseText, model: r.model })),
  );

  // --- Aggregate narrativeJson data ---
  const narratives = runs
    .map((r) => ({ parsed: parseNarrative(r.narrativeJson), run: r }))
    .filter((n): n is { parsed: NarrativeExtractionResult; run: typeof runs[number] } => n.parsed !== null);

  const narrativeCount = narratives.length;

  // Sentiment split — uses ALL scoped runs (all clusters), matching overview tab.
  // This avoids parseNarrative() filtering out runs that have sentiment but no themes array.
  // All clusters are included so sentiment is consistent across Overview and Narrative tabs.
  let posCount = 0, neuCount = 0, negCount = 0;
  for (const r of allScopedRuns) {
    const nj = r.narrativeJson as Record<string, unknown> | null;
    if (!nj) continue;
    const sent = nj.sentiment as { label?: string } | undefined;
    if (!sent?.label) continue;
    if (sent.label === "POS") posCount++;
    else if (sent.label === "NEG") negCount++;
    else neuCount++;
  }
  const sentimentTotal = posCount + neuCount + negCount;
  const sentimentSplit = sentimentTotal > 0
    ? {
        positive: Math.round((posCount / sentimentTotal) * 100),
        neutral: Math.round((neuCount / sentimentTotal) * 100),
        negative: Math.round((negCount / sentimentTotal) * 100),
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
    const promptText = expandPromptPlaceholders(run.prompt.text, { brandName, industry: brand.industry });
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
  // Uses sentimentTotal (all scoped runs with labels) to match posCount/negCount scope
  const polarization: "Low" | "Moderate" | "High" = (() => {
    if (sentimentTotal === 0) return "Low";
    const pos = posCount / sentimentTotal;
    const neg = negCount / sentimentTotal;
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
    const promptText = expandPromptPlaceholders(run.prompt.text, { brandName, industry: brand.industry });
    for (const claim of parsed.claims) {
      if (isSourceOrJunkClaim(claim.text)) continue;
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

  // Drift + trend: use the same deduped scoped runs as the scorecard.
  // This ensures the latest trend point matches the scorecard values exactly.
  // allScopedRuns comes from fetchBrandRuns (deduped latest per model+prompt).
  const allTrendRuns = allScopedRuns;
  // Theme drift uses industry runs only (narrative-specific); sentiment trend uses all clusters
  const driftRuns = allTrendRuns.filter((r) => r.narrativeJson != null && r.prompt.cluster === "industry");

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

  // Sentiment trend: group by (week, model) → % of responses that are POS
  // Matches the scorecard methodology (POS count / total count * 100)
  const sentimentBuckets: Record<string, Record<string, { pos: number; count: number }>> = {};
  for (const dr of allTrendRuns) {
    const narr = parseNarrative(dr.narrativeJson);
    // Use POS/NEU/NEG label from narrativeJson only (same as scorecard sentimentSplit).
    // Do NOT fall back to analysisJson.sentiment.legitimacy — that measures
    // credibility, not positive/negative sentiment.
    if (!narr) continue;
    const label = narr.sentiment.label;

    const d = new Date(dr.createdAt);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const weekKey = monday.toISOString().slice(0, 10);
    if (!sentimentBuckets[weekKey]) sentimentBuckets[weekKey] = {};
    // Per-model bucket
    if (!sentimentBuckets[weekKey][dr.model]) sentimentBuckets[weekKey][dr.model] = { pos: 0, count: 0 };
    sentimentBuckets[weekKey][dr.model].count++;
    if (label === "POS") sentimentBuckets[weekKey][dr.model].pos++;
    // "all" aggregate bucket
    if (!sentimentBuckets[weekKey]["all"]) sentimentBuckets[weekKey]["all"] = { pos: 0, count: 0 };
    sentimentBuckets[weekKey]["all"].count++;
    if (label === "POS") sentimentBuckets[weekKey]["all"].pos++;
  }
  const sentimentTrend = Object.entries(sentimentBuckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, models]) =>
      Object.entries(models).map(([m, { pos, count }]) => ({
        date,
        model: m,
        positive: count > 0 ? Math.round((pos / count) * 100) : 0,
      })),
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

  // Examples: use the frameRunIds map built during aggregation
  // This guarantees quotes come from runs that EXACTLY match the frame name
  const topFrameNames = narrativeBase.frames.slice(0, 5).map((f: { frame: string }) => f.frame);

  // Build a run lookup for quick access
  const runById = new Map<string, NarrativeRun>();
  for (const r of runs) {
    runById.set(r.id, r);
  }
  const narrativeByRunId = new Map<string, NarrativeExtractionResult>();
  for (const { parsed, run } of narratives) {
    narrativeByRunId.set(run.id, parsed);
  }

  const usedRunIds = new Set<string>();
  const pendingExamples: {
    runId: string; prompt: string; fullText: string; themes: string[];
    sentiment: string; model: string; matchedFrame: string;
  }[] = [];
  const examples: {
    runId: string; prompt: string; excerpt: string; themes: string[];
    sentiment: string; model: string; matchedFrame: string;
  }[] = [];

  // Find contributing runs for a finalized frame name
  // After validateFrames renames are tracked above, most frames will have exact matches.
  // For synthesized/padded frames, fall back to best word overlap (require 2+ words).
  function findFrameContributors(frameName: string): { runId: string; strength: number }[] {
    const exact = frameRunIds.get(frameName);
    if (exact && exact.length > 0) return exact;
    // Fuzzy fallback: require at least 2 overlapping significant words to avoid false matches
    const lower = frameName.toLowerCase();
    const words = lower.split(/\s+/).filter((w) => w.length > 3);
    let bestKey = "";
    let bestOverlap = 0;
    for (const [key] of frameRunIds) {
      const kWords = new Set(key.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
      const overlap = words.filter((w) => kWords.has(w)).length;
      if (overlap > bestOverlap) { bestOverlap = overlap; bestKey = key; }
    }
    if (bestOverlap >= 2 && bestKey) return frameRunIds.get(bestKey)!;
    return [];
  }

  for (const frameName of topFrameNames) {
    const contributors = findFrameContributors(frameName)
      .filter((c) => !usedRunIds.has(c.runId))
      .sort((a, b) => b.strength - a.strength);

    // Collect candidates (up to 4 per frame, GPT will pick the best)
    let collected = 0;
    for (const contributor of contributors) {
      if (collected >= 4) break;
      const run = runById.get(contributor.runId);
      if (!run) continue;
      if (!isRunInBrandScope(run, brandIdentity)) continue;

      const parsed = narrativeByRunId.get(contributor.runId);
      usedRunIds.add(contributor.runId);
      const cleanText = run.rawResponseText
        .replace(/\*\*/g, "").replace(/\*/g, "")
        .replace(/^#+\s+/gm, "").replace(/^[-*•]\s+/gm, "").replace(/^\d+\.\s+/gm, "")
        .replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
      pendingExamples.push({
        runId: contributor.runId,
        prompt: expandPromptPlaceholders(run.prompt.text, { brandName, industry: brand.industry }),
        fullText: cleanText.slice(0, 1500),
        themes: parsed ? parsed.themes.map((t) => t.label) : [],
        sentiment: parsed ? parsed.sentiment.label : "NEU",
        model: run.model,
        matchedFrame: frameName,
      });
      collected++;
    }
  }

  // Use GPT to extract the relevant quote AND explanation from each response
  // GPT reads the full text and finds the specific part about the brand + frame
  if (pendingExamples.length > 0) {
    try {
      const oai = getOpenAIDefault();
      const resp = await oai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 4096,
        messages: [
          {
            role: "system",
            content: `You extract relevant quotes from AI responses about ${brandName}.

For each item you receive a narrative frame and a full AI response. Your job:
1. Find the 1-3 sentences in the response that BEST illustrate how ${brandName} relates to the given frame
2. The quote MUST specifically mention or describe ${brandName} (not just competitors)
3. The quote MUST be relevant to the frame topic
4. Write a 1-sentence explanation of WHY this quote illustrates the frame

Return a JSON array of objects: [{"quote": "exact text from response", "reason": "1 sentence"}, ...]

Rules:
- Copy the quote exactly from the response text (don't paraphrase)
- Keep quotes under 200 characters — extract only the most relevant part
- If the response doesn't contain content about ${brandName} that relates to the frame, return {"quote": "", "reason": ""} for that item`,
          },
          {
            role: "user",
            content: JSON.stringify(
              pendingExamples.map((ex) => ({ frame: ex.matchedFrame, response: ex.fullText })),
            ),
          },
        ],
      });
      const content = resp.choices?.[0]?.message?.content?.trim() ?? "[]";
      const cleaned = content.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      const results = JSON.parse(cleaned) as { quote: string; reason: string }[];

      // Build final examples, skipping any where GPT couldn't find a relevant quote
      const seenFrames = new Map<string, number>();
      for (let i = 0; i < pendingExamples.length && i < results.length; i++) {
        const r = results[i];
        if (!r.quote) continue;
        const ex = pendingExamples[i];
        const frameCount = seenFrames.get(ex.matchedFrame) ?? 0;
        if (frameCount >= 2) continue; // max 2 per frame
        seenFrames.set(ex.matchedFrame, frameCount + 1);
        examples.push({
          runId: ex.runId,
          prompt: ex.prompt,
          excerpt: r.quote,
          themes: ex.themes,
          sentiment: ex.sentiment,
          model: ex.model,
          matchedFrame: ex.matchedFrame,
        });
        (examples[examples.length - 1] as { reason?: string }).reason = r.reason;
      }
    } catch (err) {
      console.error("[narrative] GPT quote extraction failed, using fallback:", err);
      // Fallback: use first 200 chars of brand context
      for (const ex of pendingExamples) {
        const run = runById.get(ex.runId);
        if (!run) continue;
        const sentences = splitSentences(run.rawResponseText);
        const brandContext = getEntityContextWindow(sentences, brand.name, brand.slug, 1);
        const fallback = brandContext.length > 0
          ? brandContext.join(" ").replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 200)
          : ex.fullText.slice(0, 200);
        examples.push({
          runId: ex.runId,
          prompt: ex.prompt,
          excerpt: fallback,
          themes: ex.themes,
          sentiment: ex.sentiment,
          model: ex.model,
          matchedFrame: ex.matchedFrame,
        });
      }
    }
  }

  // Sentiment by Question: uses ALL scoped runs (all clusters) so every prompt
  // type contributes to the scatter chart, matching the all-cluster sentiment split.
  const allScopedNarratives = allScopedRuns
    .map((r) => ({ parsed: parseNarrative(r.narrativeJson), run: r }))
    .filter((n): n is { parsed: NarrativeExtractionResult; run: typeof allScopedRuns[number] } => n.parsed !== null);
  const promptSentimentMap = new Map<string, { mentions: number; pos: number; neu: number; neg: number; scores: number[] }>();
  for (const { parsed, run } of allScopedNarratives) {
    const promptText = expandPromptPlaceholders(run.prompt.text, { brandName, industry: brand.industry });
    if (!promptSentimentMap.has(promptText)) {
      promptSentimentMap.set(promptText, { mentions: 0, pos: 0, neu: 0, neg: 0, scores: [] });
    }
    const entry = promptSentimentMap.get(promptText)!;
    entry.mentions++;
    const label = parsed.sentiment.label;
    if (label === "POS") entry.pos++;
    else if (label === "NEG") entry.neg++;
    else entry.neu++;
    // Keep raw scores for consistency (std dev) calculation
    const rawScore = parsed.sentiment.score;
    const numericScore = label === "POS" ? rawScore : label === "NEG" ? -rawScore : 0;
    entry.scores.push(numericScore);
  }
  const sentimentByQuestion = [...promptSentimentMap.entries()]
    .filter(([, { pos, neu, neg }]) => (pos + neu + neg) > 0)
    .map(([prompt, { mentions, pos, neu, neg, scores }]) => {
    const total = pos + neu + neg;
    const pctPositive = total > 0 ? Math.round((pos / total) * 100) : 0;
    const pctNegative = total > 0 ? Math.round((neg / total) * 100) : 0;
    const pctNeutral = total > 0 ? Math.round((neu / total) * 100) : 0;
    // Classify using same thresholds as platform sentiment (sentimentSplit → label)
    let sentiment: "Strong" | "Positive" | "Neutral" | "Conditional" | "Negative";
    if (pctPositive >= 60) sentiment = "Strong";
    else if (pctPositive >= 40) sentiment = "Positive";
    else if (pctNegative >= 40) sentiment = "Negative";
    else if (pctNeutral >= 50) sentiment = "Neutral";
    else sentiment = "Conditional";
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const mentionRate = allScopedNarratives.length > 0 ? Math.round((mentions / allScopedNarratives.length) * 100) : 0;
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
      // Only compute confidence delta if both periods have data
      let confidenceDelta = 0;
      if (recentNarrativeRuns.length > 0 && priorNarrativeRuns.length > 0) {
        const currentConfidence = 100 - hedgingFor(recentNarrativeRuns);
        const priorConfidence = 100 - hedgingFor(priorNarrativeRuns);
        confidenceDelta = currentConfidence - priorConfidence;
      }

      narrativeDeltas = {
        sentimentPositive: sentimentDelta,
        confidence: confidenceDelta,
      };
    }
  }

  // Compute hedgingRate from narrativeJson signals (matches delta and tooltip formula)
  // A response is "hedged" if it has zero authority AND zero trust signals
  const signalBasedHedgingRate = narrativeCount > 0
    ? Math.round((narratives.filter((n) => n.parsed.trustSignals === 0 && n.parsed.authoritySignals === 0).length / narrativeCount) * 100)
    : narrativeBase.hedgingRate; // fallback to analysisJson-based rate if no narrativeJson

  // Merge enhanced data into narrative response
  const narrative = {
    ...narrativeBase,
    hedgingRate: signalBasedHedgingRate,
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

  const responseBody = {
    hasData: true,
    job: formatJobMeta(job!),
    narrative,
    narrativeDeltas,
    totals: { totalRuns: runs.length, analyzedRuns: analyses.length },
  };

  // Cache the response to avoid re-running GPT calls
  narrativeCache.set(cacheKey, { response: responseBody, runCount: runs.length, ts: Date.now() });

  return NextResponse.json(responseBody, {
    headers: { "Cache-Control": brandCacheControl(brandSlug) },
  });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Narrative API error:", message, e instanceof Error ? e.stack : "");
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
