import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyPromptTopic } from "@/lib/topics/extractTopic";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ promptId: string }> },
) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const rlError = await checkRateLimit(userId, "write");
  if (rlError) return rlError;

  const { promptId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
  if (!prompt) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }
  if (!prompt.brandId) {
    return NextResponse.json(
      { error: "Cannot edit global template prompts directly" },
      { status: 403 },
    );
  }

  const data: Record<string, unknown> = {};

  // Toggle enabled
  if (typeof body.enabled === "boolean") {
    data.enabled = body.enabled;
  }

  // Edit text
  if (typeof body.text === "string" && body.text.trim().length > 0) {
    data.text = body.text.trim();
  }

  // Reset to original
  if (body.reset === true && prompt.source === "suggested" && prompt.originalText) {
    data.text = prompt.originalText;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Recompute topic classification when text changes
  if (typeof data.text === "string") {
    const { topicKey } = classifyPromptTopic(data.text as string);
    data.topicKey = topicKey;
  }

  const updated = await prisma.prompt.update({
    where: { id: promptId },
    data,
  });

  return NextResponse.json({
    prompt: {
      id: updated.id,
      text: updated.text,
      cluster: updated.cluster,
      intent: updated.intent,
      source: updated.source,
      enabled: updated.enabled,
      originalText: updated.originalText,
      topicKey: updated.topicKey,
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ promptId: string }> },
) {
  const { userId: delUserId, error: delAuthError } = await requireAuth();
  if (delAuthError) return delAuthError;
  const delRlError = await checkRateLimit(delUserId, "write");
  if (delRlError) return delRlError;

  const { promptId } = await params;

  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
  if (!prompt) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }
  if (!prompt.brandId) {
    return NextResponse.json(
      { error: "Cannot delete global template prompts" },
      { status: 403 },
    );
  }
  if (prompt.source !== "custom") {
    return NextResponse.json(
      { error: "Cannot delete suggested prompts. Disable them instead." },
      { status: 403 },
    );
  }

  // Check if any runs reference this prompt
  const runCount = await prisma.run.count({ where: { promptId } });
  if (runCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete prompt with existing runs. Disable it instead." },
      { status: 409 },
    );
  }

  await prisma.prompt.delete({ where: { id: promptId } });

  return NextResponse.json({ success: true });
}
