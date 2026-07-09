-- CreateTable
CREATE TABLE "Shot" (
    "id" BIGINT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "ratio" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolution" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shot_pkey" PRIMARY KEY ("tenantId", "projectId", "id")
);

-- CreateTable
CREATE TABLE "VideoTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "shotId" BIGINT NOT NULL,
    "shotTitle" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT NOT NULL,
    "providerTaskId" TEXT,
    "apiProfileId" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTask_pkey" PRIMARY KEY ("tenantId", "projectId", "id")
);

-- CreateTable
CREATE TABLE "VideoAsset" (
    "id" BIGINT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "shotId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "gradient" TEXT NOT NULL,
    "videoUrl" TEXT,
    "providerTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("tenantId", "projectId", "id")
);

-- Backfill shots from workspace snapshots.
INSERT INTO "Shot" ("id", "tenantId", "projectId", "title", "prompt", "ratio", "duration", "status", "resolution", "width", "height", "sortOrder", "createdAt", "updatedAt")
SELECT DISTINCT ON (workspace."tenantId", workspace."projectId", ((shot.value->>'id')::BIGINT))
    (shot.value->>'id')::BIGINT,
    workspace."tenantId",
    workspace."projectId",
    COALESCE(NULLIF(shot.value->>'title', ''), '未命名分镜'),
    COALESCE(shot.value->>'prompt', ''),
    COALESCE(NULLIF(shot.value->>'ratio', ''), '9:16 竖屏短剧'),
    CASE WHEN shot.value->>'duration' ~ '^\d+$' THEN (shot.value->>'duration')::INTEGER ELSE 6 END,
    COALESCE(NULLIF(shot.value->>'status', ''), 'pending'),
    NULLIF(shot.value->>'resolution', ''),
    CASE WHEN shot.value->>'width' ~ '^\d+$' THEN (shot.value->>'width')::INTEGER ELSE NULL END,
    CASE WHEN shot.value->>'height' ~ '^\d+$' THEN (shot.value->>'height')::INTEGER ELSE NULL END,
    shot.ordinality::INTEGER - 1,
    workspace."createdAt",
    workspace."updatedAt"
FROM "ProjectWorkspace" workspace
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(workspace."state"::jsonb->'shots', '[]'::jsonb)) WITH ORDINALITY AS shot(value, ordinality)
WHERE shot.value->>'id' ~ '^\d+$'
ON CONFLICT ("tenantId", "projectId", "id") DO NOTHING;

-- Backfill video tasks from workspace snapshots.
INSERT INTO "VideoTask" ("id", "tenantId", "projectId", "shotId", "shotTitle", "provider", "status", "result", "providerTaskId", "apiProfileId", "snapshot", "createdAt", "updatedAt")
SELECT DISTINCT ON (workspace."tenantId", workspace."projectId", task.value->>'id')
    task.value->>'id',
    workspace."tenantId",
    workspace."projectId",
    CASE WHEN task.value->>'shotId' ~ '^\d+$' THEN (task.value->>'shotId')::BIGINT ELSE 0 END,
    COALESCE(NULLIF(task.value->>'shotTitle', ''), '未命名视频'),
    COALESCE(NULLIF(task.value->>'provider', ''), '视频生成'),
    COALESCE(NULLIF(task.value->>'status', ''), 'pending'),
    COALESCE(task.value->>'result', ''),
    NULLIF(task.value->>'providerTaskId', ''),
    NULLIF(task.value->'apiProfile'->>'id', ''),
    task.value->'snapshot',
    workspace."createdAt",
    workspace."updatedAt"
FROM "ProjectWorkspace" workspace
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(workspace."state"::jsonb->'tasks', '[]'::jsonb)) AS task(value)
WHERE NULLIF(task.value->>'id', '') IS NOT NULL
ON CONFLICT ("tenantId", "projectId", "id") DO NOTHING;

-- Backfill video assets from workspace snapshots.
INSERT INTO "VideoAsset" ("id", "tenantId", "projectId", "shotId", "title", "meta", "gradient", "videoUrl", "providerTaskId", "createdAt", "updatedAt")
SELECT DISTINCT ON (workspace."tenantId", workspace."projectId", ((asset.value->>'id')::BIGINT))
    (asset.value->>'id')::BIGINT,
    workspace."tenantId",
    workspace."projectId",
    CASE WHEN asset.value->>'shotId' ~ '^\d+$' THEN (asset.value->>'shotId')::BIGINT ELSE 0 END,
    COALESCE(NULLIF(asset.value->>'title', ''), '未命名视频'),
    COALESCE(asset.value->>'meta', ''),
    COALESCE(NULLIF(asset.value->>'gradient', ''), 'linear-gradient(135deg, #1f2937, #111827)'),
    NULLIF(asset.value->>'videoUrl', ''),
    NULLIF(asset.value->>'providerTaskId', ''),
    workspace."createdAt",
    workspace."updatedAt"
FROM "ProjectWorkspace" workspace
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(workspace."state"::jsonb->'assets', '[]'::jsonb)) AS asset(value)
WHERE asset.value->>'id' ~ '^\d+$'
ON CONFLICT ("tenantId", "projectId", "id") DO NOTHING;

-- CreateIndex
CREATE INDEX "Shot_tenantId_projectId_sortOrder_idx" ON "Shot"("tenantId", "projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Shot_tenantId_status_idx" ON "Shot"("tenantId", "status");

-- CreateIndex
CREATE INDEX "VideoTask_tenantId_projectId_updatedAt_idx" ON "VideoTask"("tenantId", "projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "VideoTask_tenantId_status_idx" ON "VideoTask"("tenantId", "status");

-- CreateIndex
CREATE INDEX "VideoTask_providerTaskId_idx" ON "VideoTask"("providerTaskId");

-- CreateIndex
CREATE INDEX "VideoAsset_tenantId_projectId_updatedAt_idx" ON "VideoAsset"("tenantId", "projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "VideoAsset_tenantId_shotId_idx" ON "VideoAsset"("tenantId", "shotId");

-- CreateIndex
CREATE INDEX "VideoAsset_providerTaskId_idx" ON "VideoAsset"("providerTaskId");

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTask" ADD CONSTRAINT "VideoTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
