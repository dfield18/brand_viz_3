import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  // Exclude free-tier ephemeral brands (slugs with `--`, created by the
  // free-run pipeline). They'd show up as duplicate "ACLU" / "Nike" /
  // etc. rows in the dropdown because each free run writes its own row
  // with the same displayName. The `--` separator can never be produced
  // by the Pro slugifier (src/components/Header.tsx:104) which collapses
  // runs of non-alphanumerics to a single dash.
  const brands = await prisma.brand.findMany({
    where: {
      jobs: { some: { status: "done" } },
      NOT: { slug: { contains: "--" } },
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
