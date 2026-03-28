import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/backfill/migrate-clusters
 *
 * One-time migration: remap old prompt clusters (direct, related,
 * comparative, network) → "brand". Industry stays as-is.
 *
 * Safe to run multiple times — only updates rows that still have
 * old cluster values.
 */
export async function POST() {
  const OLD_CLUSTERS = ["direct", "related", "comparative", "network"];

  const result = await prisma.prompt.updateMany({
    where: { cluster: { in: OLD_CLUSTERS } },
    data: { cluster: "brand" },
  });

  return NextResponse.json({
    migrated: result.count,
    message: `Migrated ${result.count} prompts from [${OLD_CLUSTERS.join(", ")}] → "brand"`,
  });
}
