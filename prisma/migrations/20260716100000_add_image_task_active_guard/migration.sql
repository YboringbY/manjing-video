-- Prevent concurrent requests from starting multiple paid image jobs for one user and project.
CREATE UNIQUE INDEX "ImageTask_one_active_per_user_project_idx"
ON "ImageTask"("tenantId", "projectId", "createdById")
WHERE "status" IN ('pending', 'running');
