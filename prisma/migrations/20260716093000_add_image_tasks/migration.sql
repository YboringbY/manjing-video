-- Durable image generation tasks let the browser poll instead of holding a long request open.
CREATE TABLE "ImageTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "imageCount" INTEGER NOT NULL,
    "referenceMaterialId" INTEGER,
    "resultMaterialIds" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageTask_pkey" PRIMARY KEY ("tenantId", "projectId", "id")
);

CREATE INDEX "ImageTask_tenantId_projectId_createdAt_idx" ON "ImageTask"("tenantId", "projectId", "createdAt");
CREATE INDEX "ImageTask_tenantId_projectId_status_idx" ON "ImageTask"("tenantId", "projectId", "status");
CREATE INDEX "ImageTask_createdById_status_idx" ON "ImageTask"("createdById", "status");
ALTER TABLE "ImageTask"
ADD CONSTRAINT "ImageTask_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
