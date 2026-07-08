CREATE TABLE "ApiProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "model" TEXT,
    "textModels" JSONB NOT NULL,
    "scriptModels" JSONB,
    "videoModels" JSONB NOT NULL,
    "imageModels" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAtMillis" BIGINT,
    "updatedAtMillis" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiProfile_tenantId_name_baseUrl_key" ON "ApiProfile"("tenantId", "name", "baseUrl");
CREATE INDEX "ApiProfile_tenantId_active_idx" ON "ApiProfile"("tenantId", "active");
CREATE INDEX "ApiProfile_tenantId_enabled_priority_idx" ON "ApiProfile"("tenantId", "enabled", "priority");

ALTER TABLE "ApiProfile" ADD CONSTRAINT "ApiProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
