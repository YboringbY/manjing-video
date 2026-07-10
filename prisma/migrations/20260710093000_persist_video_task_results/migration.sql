-- AlterTable
ALTER TABLE "VideoTask"
ADD COLUMN "videoUrl" TEXT,
ADD COLUMN "error" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill successful task results from existing generated video assets.
UPDATE "VideoTask" AS task
SET
    "videoUrl" = asset."videoUrl",
    "completedAt" = asset."updatedAt"
FROM "VideoAsset" AS asset
WHERE task."tenantId" = asset."tenantId"
  AND task."projectId" = asset."projectId"
  AND task."shotId" = asset."shotId"
  AND task."providerTaskId" IS NOT NULL
  AND task."providerTaskId" = asset."providerTaskId"
  AND asset."videoUrl" IS NOT NULL;

-- Preserve the existing failure text as structured task error data.
UPDATE "VideoTask"
SET "error" = "result",
    "completedAt" = COALESCE("completedAt", "updatedAt")
WHERE "status" = 'failed'
  AND NULLIF("result", '') IS NOT NULL;
