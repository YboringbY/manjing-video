-- CreateTable
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "previewUrl" TEXT,
    "storagePath" TEXT,
    "seedanceAssetUrl" TEXT,
    "reviewedAssetUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "scope" TEXT NOT NULL DEFAULT 'project',
    "prompt" TEXT,
    "sourceProjectId" INTEGER,
    "sourceProjectName" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Material_tenantId_projectId_createdAt_idx" ON "Material"("tenantId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Material_tenantId_scope_createdAt_idx" ON "Material"("tenantId", "scope", "createdAt");

-- CreateIndex
CREATE INDEX "Material_createdById_idx" ON "Material"("createdById");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
