import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "50", 10) || 50, 1), 200);

  const runs = await prisma.run.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      prompt: {
        select: { id: true, text: true, cluster: true, intent: true },
      },
    },
  });

  return NextResponse.json({
    jobId,
    runs: runs.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      model: r.model,
      requestHash: r.requestHash,
      prompt: r.prompt,
      rawResponseText: r.rawResponseText,
    })),
  });
}
