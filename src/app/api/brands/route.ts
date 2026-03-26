import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const brands = await prisma.brand.findMany({
    where: {
      jobs: { some: { status: "done" } },
    },
    select: {
      id: true,
      name: true,
      displayName: true,
      slug: true,
      category: true,
      industry: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    brands: brands.map((b: { id: string; name: string; displayName: string | null; slug: string; category: string | null; industry: string | null; createdAt: Date }) => ({
      id: b.id,
      name: b.displayName || b.name,
      slug: b.slug,
      category: b.category,
      industry: b.industry,
      createdAt: b.createdAt.toISOString(),
    })),
  });
}
