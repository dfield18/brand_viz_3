import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeBrandRank } from "@/lib/visibility/brandMention";

/**
 * GET /api/response-detail?brandSlug=...&promptText=...&model=...
 * GET /api/response-detail?brandSlug=...&model=...&positionMin=1&positionMax=1
 *
 * Returns raw responses for a given brand + prompt or brand + model + position range.
 */
export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const promptText = req.nextUrl.searchParams.get("promptText");
  const model = req.nextUrl.searchParams.get("model");
  const positionMin = req.nextUrl.searchParams.get("positionMin");
  const positionMax = req.nextUrl.searchParams.get("positionMax");

  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  const brandName = (brand as unknown as { displayName?: string | null }).displayName || brand.name;

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
    const industry = (brand as unknown as { industry?: string | null }).industry;
    if (industry) {
      const escIndustry = industry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      templateText = templateText.replace(new RegExp(escIndustry, "gi"), "{industry}");
    }

    const promptTexts = [promptText, templateText].filter((v, i, a) => a.indexOf(v) === i);

    const runs = await prisma.run.findMany({
      where: {
        brandId: brand.id,
        prompt: { text: { in: promptTexts } },
        ...(model && model !== "all" ? { model } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        model: true,
        rawResponseText: true,
        analysisJson: true,
        createdAt: true,
        prompt: { select: { text: true, cluster: true, intent: true } },
      },
    });

    return respondWith(brandName, runs);
  }

  // Mode 2: By model + position range (for dot chart drill-down)
  if (model && model !== "all") {
    const minPos = positionMin ? parseInt(positionMin, 10) : null;
    const maxPos = positionMax ? parseInt(positionMax, 10) : null;

    const runs = await prisma.run.findMany({
      where: {
        brandId: brand.id,
        model,
        prompt: { cluster: "industry" },
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

    // Filter by position range client-side
    if (minPos !== null) {
      const isNotMentioned = minPos === -1;
      const filtered = runs.filter((r) => {
        const rank = computeBrandRank(r.rawResponseText, brand.name, brand.slug, r.analysisJson);
        if (isNotMentioned) return rank === null;
        return rank !== null && rank >= minPos && (maxPos === null || rank <= maxPos);
      });
      return respondWith(brandName, filtered.slice(0, 4));
    }

    return respondWith(brandName, runs.slice(0, 4));
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
  }[]
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
    responses: deduped.map((r) => ({
      id: r.id,
      model: r.model,
      responseText: r.rawResponseText,
      analysis: r.analysisJson,
      date: r.createdAt.toISOString().slice(0, 10),
      prompt: {
        text: r.prompt.text,
        cluster: r.prompt.cluster,
        intent: r.prompt.intent,
      },
    })),
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
  });
}
