import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllBrandPrompts } from "@/lib/promptService";
import { classifyPromptTopic } from "@/lib/topics/extractTopic";
import { findOrCreateBrand } from "@/lib/brand";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

const VALID_CLUSTERS = ["direct", "related", "comparative", "network", "industry"];
const VALID_INTENTS = ["informational", "high-intent"];

export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const rlError = await checkRateLimit(userId, "read");
  if (rlError) return rlError;

  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  try {
    const brand = await findOrCreateBrand(brandSlug);

    const prompts = await getAllBrandPrompts(brand.id);

    return NextResponse.json({
      industry: brand.industry ?? null,
      prompts: prompts.map((p) => ({
        id: p.id,
        text: p.text,
        cluster: p.cluster,
        intent: p.intent,
        source: p.source,
        enabled: p.enabled,
        originalText: p.originalText,
        topicKey: p.topicKey,
      })),
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("GET /api/prompts error:", e);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId: postUserId, error: postAuthError } = await requireAuth();
  if (postAuthError) return postAuthError;
  const postRlError = await checkRateLimit(postUserId, "write");
  if (postRlError) return postRlError;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { brandSlug, text, cluster, intent } = body as {
    brandSlug?: string;
    text?: string;
    cluster?: string;
    intent?: string;
  };

  if (!brandSlug || typeof brandSlug !== "string") {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Prompt text is required" }, { status: 400 });
  }
  if (!cluster || !VALID_CLUSTERS.includes(cluster)) {
    return NextResponse.json(
      { error: `Invalid cluster. Must be one of: ${VALID_CLUSTERS.join(", ")}` },
      { status: 400 },
    );
  }
  if (!intent || !VALID_INTENTS.includes(intent)) {
    return NextResponse.json(
      { error: `Invalid intent. Must be one of: ${VALID_INTENTS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const brand = await findOrCreateBrand(brandSlug);

    const { topicKey } = classifyPromptTopic(text.trim());
    const prompt = await prisma.prompt.create({
      data: {
        brandId: brand.id,
        text: text.trim(),
        cluster,
        intent,
        source: "custom",
        enabled: true,
        topicKey,
      },
    });

    return NextResponse.json({
      prompt: {
        id: prompt.id,
        text: prompt.text,
        cluster: prompt.cluster,
        intent: prompt.intent,
        source: prompt.source,
        enabled: prompt.enabled,
        originalText: prompt.originalText,
        topicKey: prompt.topicKey,
      },
    }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("POST /api/prompts error:", e);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
