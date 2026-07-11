import { Prisma } from "@prisma/client";

export type VideoTaskRecord = Prisma.VideoTaskGetPayload<Record<string, never>>;

export function safeNumberFromBigInt(value: bigint) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

export function publicVideoTask(task: VideoTaskRecord) {
  return {
    id: task.id,
    shotId: safeNumberFromBigInt(task.shotId),
    shotTitle: task.shotTitle,
    provider: task.provider,
    status: task.status,
    result: task.result,
    providerTaskId: task.providerTaskId || undefined,
    apiProfile: task.apiProfileId ? { id: task.apiProfileId } : undefined,
    snapshot: task.snapshot || undefined,
    videoUrl: task.videoUrl || undefined,
    error: task.error || undefined,
    rating: task.rating || undefined,
    feedback: task.feedback || undefined,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString()
  };
}
