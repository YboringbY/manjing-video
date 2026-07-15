-- Exact-content metadata supports idempotent uploads without changing existing materials.
ALTER TABLE "Material"
ADD COLUMN "contentHash" TEXT,
ADD COLUMN "byteSize" INTEGER,
ADD COLUMN "mimeType" TEXT;

CREATE UNIQUE INDEX "Material_tenantId_projectId_kind_contentHash_key"
ON "Material"("tenantId", "projectId", "kind", "contentHash");
