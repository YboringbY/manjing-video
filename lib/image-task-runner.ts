import { logAudit } from "@/lib/audit";
import { generateAndPersistImages, ImageGenerationError } from "@/lib/image-generation";
import { prisma } from "@/lib/prisma";

type ImageTaskIdentity = { tenantId: string; projectId: number; id: string };

const activeTasks = new Set<string>();

function taskKey(task: ImageTaskIdentity) {
  return `${task.tenantId}:${task.projectId}:${task.id}`;
}

export function isImageTaskActive(task: ImageTaskIdentity) {
  return activeTasks.has(taskKey(task));
}

export async function runImageTask(identity: ImageTaskIdentity) {
  const key = taskKey(identity);
  if (activeTasks.has(key)) return;
  activeTasks.add(key);
  try {
    const claimed = await prisma.imageTask.updateMany({
      where: { ...identity, status: "pending" },
      data: { status: "running", startedAt: new Date(), error: null }
    });
    if (!claimed.count) return;
    const task = await prisma.imageTask.findUnique({ where: { tenantId_projectId_id: identity } });
    if (!task) return;

    const actor = {
      tenantId: task.tenantId,
      userId: task.createdById || undefined,
      displayName: task.createdByName || "系统任务"
    };
    try {
      const result = await generateAndPersistImages(actor, {
        model: task.model,
        prompt: task.prompt,
        size: task.size,
        n: task.imageCount,
        projectId: task.projectId,
        referenceMaterialId: task.referenceMaterialId || undefined
      });
      await prisma.imageTask.update({
        where: { tenantId_projectId_id: identity },
        data: { status: "done", resultMaterialIds: result.materials.map(material => material.id), completedAt: new Date(), error: null }
      });
      await logAudit({
        actor: { tenantId: actor.tenantId, userId: actor.userId, user: { displayName: actor.displayName } },
        action: "image.generate",
        targetType: "image_task",
        targetId: task.id,
        metadata: { projectId: task.projectId, model: result.model, size: result.size, count: result.materials.length, promptLength: result.prompt.length, referenceMaterialId: result.referenceMaterialId, materialIds: result.materials.map(material => material.id) }
      });
    } catch (error) {
      const failure = error instanceof ImageGenerationError
        ? error
        : new ImageGenerationError(500, error instanceof Error ? error.message : "图片生成失败。", "unknown");
      await prisma.imageTask.update({
        where: { tenantId_projectId_id: identity },
        data: { status: "failed", error: failure.message, completedAt: new Date() }
      }).catch(() => undefined);
      await logAudit({
        actor: { tenantId: actor.tenantId, userId: actor.userId, user: { displayName: actor.displayName } },
        action: "image.generate",
        targetType: "image_task",
        targetId: task.id,
        result: "failure",
        metadata: { projectId: task.projectId, stage: failure.stage, status: failure.status, model: task.model, promptLength: task.prompt.length, referenceMaterialId: task.referenceMaterialId, message: failure.message }
      });
    }
  } finally {
    activeTasks.delete(key);
  }
}
