import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { brand: { select: { id: true, slug: true, name: true } } },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const [totalPrompts, completedPrompts] = await Promise.all([
    prisma.prompt.count({ where: { brandId: job.brandId, enabled: true } }),
    prisma.run.count({ where: { jobId } }),
  ]);

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    model: job.model,
    range: job.range,
    brand: job.brand,
    totalPrompts,
    completedPrompts,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    error: job.error ?? null,
  });
}
