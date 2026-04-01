import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeBrandRank } from "@/lib/visibility/brandMention";
import { filterRunsToBrandScope, filterRunsToBrandQueryUniverse, buildBrandIdentity, type BrandScopeRun, type BrandScopeIdentity } from "@/lib/visibility/brandScope";

type ScopeMode = "content" | "query_universe";

function applyScope<T extends BrandScopeRun>(runs: T[], brand: BrandScopeIdentity, mode: ScopeMode): T[] {
  return mode === "content"
    ? filterRunsToBrandScope(runs, brand)
    : filterRunsToBrandQueryUniverse(runs, brand);
}

/**
 * GET /api/response-detail?brandSlug=...&promptText=...&model=...
 * GET /api/response-detail?brandSlug=...&model=...&positionMin=1&positionMax=1
 *
 * Returns raw responses for a given brand + prompt or brand + model + position range.
 */
export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const runId = req.nextUrl.searchParams.get("runId");
  const promptText = req.nextUrl.searchParams.get("promptText");
  const model = req.nextUrl.searchParams.get("model");
  const scopeModeParam = req.nextUrl.searchParams.get("scopeMode") as ScopeMode | null;
  const positionMin = req.nextUrl.searchParams.get("positionMin");
  const positionMax = req.nextUrl.searchParams.get("positionMax");

  // Mode 0: By runId (direct lookup, no brandSlug required)
  if (runId) {
    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: {
        id: true,
        model: true,
        rawResponseText: true,
        analysisJson: true,
        createdAt: true,
        prompt: { select: { text: true, cluster: true, intent: true } },
        brand: { select: { name: true, displayName: true, industry: true } },
      },
    });
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    const name = run.brand.displayName || run.brand.name;
    const industry = (run.brand as unknown as { industry?: string | null }).industry;
    return respondWith(name, [run], industry);
  }

  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug or runId" }, { status: 400 });
  }

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  const brandName = (brand as unknown as { displayName?: string | null }).displayName || brand.name;
  const brandIndustry = (brand as unknown as { industry?: string | null }).industry;
  const brandAliases = brand.aliases?.length ? brand.aliases : undefined;
  const brandIdentity = buildBrandIdentity(brand);

  // Mode 1: By prompt text
  if (promptText) {
    // Try reversing both displayName and brand.name back to {brand} template
    const escName = brand.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escDisplay = brandName !== brand.name
      ? brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : null;

    let templateText = promptText;
    // Replace display name first (shorter, e.g. "Apple"), then full name (e.g. "Apple Inc")
    if (escDisplay) {
      templateText = templateText.replace(new RegExp(escDisplay, "gi"), "{brand}");
    }
    templateText = templateText.replace(new RegExp(escName, "gi"), "{brand}");

    // Also try replacing industry placeholder back
    // expandPromptPlaceholders expands {industry} to "the X industry", so reverse that pattern first
    const industry = (brand as unknown as { industry?: string | null }).industry;
    if (industry) {
      const escIndustry = industry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Match the full expanded form "the X industry" first, then bare industry name
      templateText = templateText.replace(new RegExp(`the ${escIndustry} industry`, "gi"), "{industry}");
      templateText = templateText.replace(new RegExp(escIndustry, "gi"), "{industry}");
    }

    const promptTexts = [promptText, templateText].filter((v, i, a) => a.indexOf(v) === i);

    const rawRuns = await prisma.run.findMany({
      where: {
        brandId: brand.id,
        prompt: { text: { in: promptTexts } },
        ...(model && model !== "all" ? { model } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        model: true,
        rawResponseText: true,
        analysisJson: true,
        createdAt: true,
        prompt: { select: { text: true, cluster: true, intent: true } },
      },
    });
    // Default prompt-text mode to content scope (qualitative previews)
    const promptScope = scopeModeParam ?? "content";
    const scopedRuns = applyScope(rawRuns, brandIdentity, promptScope);

    return respondWith(brandName, scopedRuns.slice(0, 4), brandIndustry);
  }

  // Mode 2: By model + position range (for dot chart drill-down)
  if (model && model !== "all") {
    const minPos = positionMin ? parseInt(positionMin, 10) : null;
    const maxPos = positionMax ? parseInt(positionMax, 10) : null;

    const rawPosRuns = await prisma.run.findMany({
      where: {
        brandId: brand.id,
        model,
        prompt: { cluster: "industry" },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        model: true,
        rawResponseText: true,
        analysisJson: true,
        createdAt: true,
        prompt: { select: { text: true, cluster: true, intent: true } },
      },
    });
    // Default position-range mode to query_universe scope (visibility drilldowns)
    const posScope = scopeModeParam ?? "query_universe";
    const scopedPosRuns = applyScope(rawPosRuns, brandIdentity, posScope);

    // Filter by position range client-side
    if (minPos !== null) {
      const isNotMentioned = minPos === -1;
      const filtered = scopedPosRuns.filter((r) => {
        const rank = computeBrandRank(r.rawResponseText, brandName, brand.slug, r.analysisJson, brandAliases);
        if (isNotMentioned) return rank === null;
        return rank !== null && rank >= minPos && (maxPos === null || rank <= maxPos);
      });
      return respondWith(brandName, filtered.slice(0, 4), brandIndustry);
    }

    return respondWith(brandName, scopedPosRuns.slice(0, 4), brandIndustry);
  }

  return NextResponse.json({ error: "Provide promptText or model with position range" }, { status: 400 });
}

function respondWith(
  brandName: string,
  runs: {
    id: string;
    model: string;
    rawResponseText: string;
    analysisJson: unknown;
    createdAt: Date;
    prompt: { text: string; cluster: string | null; intent: string | null };
  }[],
  industry?: string | null,
) {
  if (runs.length === 0) {
    return NextResponse.json({ brandName, responses: [] });
  }

  const seen = new Set<string>();
  const deduped = runs.filter((r) => {
    const key = `${r.model}|${r.prompt.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({
    brandName,
    responses: deduped.map((r) => {
      // Expand placeholders in prompt text
      let expandedPrompt = r.prompt.text
        .replace(/\{brand\}/gi, brandName)
        .replace(/\{industry\}/gi, industry || `${brandName}'s industry`);
      // Replace {competitor} with the top competitor from analysis
      if (expandedPrompt.includes("{competitor}")) {
        const analysis = r.analysisJson as { competitors?: { name: string }[] } | null;
        const topComp = analysis?.competitors?.[0]?.name ?? "competitors";
        expandedPrompt = expandedPrompt.replace(/\{competitor\}/gi, topComp);
      }
      return {
        id: r.id,
        model: r.model,
        responseText: r.rawResponseText,
        analysis: r.analysisJson,
        date: r.createdAt.toISOString().slice(0, 10),
        prompt: {
          text: expandedPrompt,
          cluster: r.prompt.cluster,
          intent: r.prompt.intent,
        },
      };
    }),
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
  });
}
