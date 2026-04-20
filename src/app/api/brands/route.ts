import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  // Exclude free-tier ephemeral brands (slugs with `--`, created by the
  // current free-run pipeline). They'd show up as duplicate "ACLU" /
  // "Nike" / etc. rows in the dropdown because each free run writes its
  // own row with the same displayName. The `--` separator can never be
  // produced by the Pro slugifier (src/components/Header.tsx:104) which
  // collapses runs of non-alphanumerics to a single dash.
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

  // Additional post-filters that are easier in JS than in Prisma:
  //   1. Legacy single-dash free-tier slugs — `<base>-[0-9a-f]{8}` —
  //      created before we switched to the `--` separator. Looks like a
  //      real Pro slug but isn't. A Pro-typed name could theoretically
  //      produce one (e.g. "Foo a1b2c3d4" → "foo-a1b2c3d4") so the risk
  //      of false-positive is low but non-zero; the user's already-live
  //      Pro brands dropdown prioritizes correctness (no duplicates)
  //      over keeping that edge case visible.
  //   2. Dedupe by displayName — if multiple brands share the same
  //      displayName (from legacy free runs, renames, or accidental
  //      duplicate Add Brand), keep only the most recently created. The
  //      list is already ordered by createdAt DESC, so the first
  //      occurrence of each displayName wins.
  const legacyEphemeral = /-[0-9a-f]{8}$/;
  const seenNames = new Set<string>();
  const deduped = brands.filter((b) => {
    if (legacyEphemeral.test(b.slug)) return false;
    const key = (b.displayName || b.name).trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  return NextResponse.json({
    brands: deduped.map((b: { id: string; name: string; displayName: string | null; slug: string; category: string | null; industry: string | null; createdAt: Date }) => ({
      id: b.id,
      name: b.displayName || b.name,
      slug: b.slug,
      category: b.category,
      industry: b.industry,
      createdAt: b.createdAt.toISOString(),
    })),
  });
}
