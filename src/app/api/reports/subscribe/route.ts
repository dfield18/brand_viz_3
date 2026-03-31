import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/reports/subscribe?brandSlug=xyz
 * Returns current subscription status for this brand + user email.
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;

  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const subscriptions = await prisma.emailSubscription.findMany({
    where: { brandId: brand.id },
    select: { id: true, email: true, frequency: true, enabled: true, lastSentAt: true },
  });

  return NextResponse.json({ subscriptions });
}

/**
 * POST /api/reports/subscribe
 * Body: { brandSlug, email, frequency? }
 * Creates or re-enables an email subscription.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const { brandSlug, email, frequency = "weekly" } = body;

  if (!brandSlug || !email) {
    return NextResponse.json({ error: "brandSlug and email are required" }, { status: 400 });
  }
  if (!["weekly", "monthly"].includes(frequency)) {
    return NextResponse.json({ error: "frequency must be weekly or monthly" }, { status: 400 });
  }
  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const subscription = await prisma.emailSubscription.upsert({
    where: { brandId_email: { brandId: brand.id, email } },
    create: { brandId: brand.id, email, frequency, enabled: true, unsubscribeToken: crypto.randomUUID() },
    update: { frequency, enabled: true },
  });

  return NextResponse.json({ subscription });
}

/**
 * DELETE /api/reports/subscribe
 * Body: { brandSlug, email }
 * Disables an email subscription.
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { brandSlug, email } = body;

  if (!brandSlug || !email) {
    return NextResponse.json({ error: "brandSlug and email are required" }, { status: 400 });
  }

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  await prisma.emailSubscription.updateMany({
    where: { brandId: brand.id, email },
    data: { enabled: false },
  });

  return NextResponse.json({ ok: true });
}
