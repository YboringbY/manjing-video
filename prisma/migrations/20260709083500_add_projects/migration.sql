-- CreateTable
CREATE TABLE "Project" (
    "id" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AI 漫剧',
    "script" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- Backfill projects from existing workspace snapshots.
INSERT INTO "Project" ("id", "tenantId", "name", "type", "script", "updatedById", "createdAt", "updatedAt")
SELECT DISTINCT ON ("projectId")
    "projectId",
    "tenantId",
    COALESCE(NULLIF("name", ''), COALESCE(NULLIF("state"->'project'->>'name', ''), '未命名项目')),
    COALESCE(NULLIF("state"->'project'->>'type', ''), 'AI 漫剧'),
    COALESCE("state"->'project'->>'script', ''),
    "updatedById",
    "createdAt",
    "updatedAt"
FROM "ProjectWorkspace"
ORDER BY "projectId", "updatedAt" DESC
ON CONFLICT ("id") DO NOTHING;

-- Backfill project rows for material-only records, if any exist.
INSERT INTO "Project" ("id", "tenantId", "name", "createdAt", "updatedAt")
SELECT DISTINCT ON ("projectId")
    "projectId",
    "tenantId",
    COALESCE(NULLIF("sourceProjectName", ''), '项目 ' || "projectId"::TEXT),
    MIN("createdAt") OVER (PARTITION BY "projectId"),
    MAX("updatedAt") OVER (PARTITION BY "projectId")
FROM "Material"
WHERE NOT EXISTS (
    SELECT 1 FROM "Project" WHERE "Project"."id" = "Material"."projectId"
)
ORDER BY "projectId", "updatedAt" DESC
ON CONFLICT ("id") DO NOTHING;

-- CreateIndex
CREATE INDEX "Project_tenantId_updatedAt_idx" ON "Project"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");

-- CreateIndex
CREATE INDEX "Project_updatedById_idx" ON "Project"("updatedById");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
