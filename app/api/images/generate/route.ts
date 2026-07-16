import { NextResponse } from "next/server";
import { databaseInt } from "@/lib/api-input";
import { logAudit } from "@/lib/audit";
import { getCurrentMembership } from "@/lib/auth";
import { generateAndPersistImages, ImageGenerationError, ImageGenerationInput } from "@/lib/image-generation";
import { rateLimit } from "@/lib/rate-limit";

type ImageGeneratePayload = Partial<Omit<ImageGenerationInput, "projectId">> & { projectId?: string | number; referenceMaterialId?: string | number };

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `images:generate:${membership.userId}`, limit: 120, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const body = await request.json() as ImageGeneratePayload;
  const projectId = databaseInt(body.projectId);
  const referenceMaterialId = databaseInt(body.referenceMaterialId);
  const input: ImageGenerationInput = {
    model: body.model,
    prompt: String(body.prompt || ""),
    size: String(body.size || "1024x1024"),
    n: Number(body.n || 1),
    projectId: projectId || 0,
    referenceMaterialId
  };
  const actor = { tenantId: membership.tenantId, userId: membership.userId, displayName: membership.user.displayName };

  try {
    const result = await generateAndPersistImages(actor, input);
    await logAudit({
      request,
      actor: membership,
      action: "image.generate",
      targetType: "image",
      targetId: String(projectId || ""),
      metadata: {
        model: result.model,
        size: result.size,
        count: result.materials.length,
        promptLength: result.prompt.length,
        referenceMaterialId: result.referenceMaterialId,
        materialIds: result.materials.map(material => material.id)
      }
    });
    return NextResponse.json({ code: 0, data: result.materials });
  } catch (error) {
    const failure = error instanceof ImageGenerationError
      ? error
      : new ImageGenerationError(500, error instanceof Error ? error.message : "图片生成失败。", "unknown");
    await logAudit({
      request,
      actor: membership,
      action: "image.generate",
      targetType: "image",
      targetId: String(projectId || ""),
      result: "failure",
      metadata: { stage: failure.stage, status: failure.status, model: input.model, promptLength: input.prompt.length, referenceMaterialId, message: failure.message }
    });
    return NextResponse.json({ code: failure.status, message: failure.message, raw: failure.raw }, { status: failure.status });
  }
}
