ALTER TABLE "Material"
ALTER COLUMN "projectId" DROP NOT NULL;

CREATE TABLE "ProjectMaterial" (
    "tenantId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMaterial_pkey" PRIMARY KEY ("tenantId", "projectId", "materialId")
);

INSERT INTO "ProjectMaterial" ("tenantId", "projectId", "materialId", "createdAt")
SELECT material."tenantId", material."projectId", material."id", material."createdAt"
FROM "Material" material
INNER JOIN "Project" project
    ON project."id" = material."projectId"
   AND project."tenantId" = material."tenantId"
WHERE material."projectId" IS NOT NULL
ON CONFLICT DO NOTHING;

DELETE FROM "Material"
WHERE "scope" = 'project'
  AND "projectId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Project" project
    WHERE project."id" = "Material"."projectId"
      AND project."tenantId" = "Material"."tenantId"
  );

ALTER TABLE "Material"
ADD CONSTRAINT "Material_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectMaterial"
ADD CONSTRAINT "ProjectMaterial_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMaterial"
ADD CONSTRAINT "ProjectMaterial_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMaterial"
ADD CONSTRAINT "ProjectMaterial_materialId_fkey"
FOREIGN KEY ("materialId") REFERENCES "Material"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ProjectMaterial_tenantId_projectId_createdAt_idx"
ON "ProjectMaterial"("tenantId", "projectId", "createdAt");

CREATE INDEX "ProjectMaterial_materialId_idx"
ON "ProjectMaterial"("materialId");
