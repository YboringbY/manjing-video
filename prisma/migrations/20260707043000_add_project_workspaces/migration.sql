-- CreateTable
CREATE TABLE "ProjectWorkspace" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkspace_tenantId_projectId_key" ON "ProjectWorkspace"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectWorkspace_tenantId_updatedAt_idx" ON "ProjectWorkspace"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "ProjectWorkspace_updatedById_idx" ON "ProjectWorkspace"("updatedById");

-- AddForeignKey
ALTER TABLE "ProjectWorkspace" ADD CONSTRAINT "ProjectWorkspace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkspace" ADD CONSTRAINT "ProjectWorkspace_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
