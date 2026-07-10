-- Legacy browser task IDs contain the last six digits of Date.now(). The
-- original backfill assigned every task the workspace creation timestamp,
-- which made submission ordering indeterminate.
WITH inferred_legacy_times AS (
    SELECT
        task."tenantId",
        task."projectId",
        task."id",
        (
            (task."shotId" / 1000000) * 1000000
            + substring(task."id" FROM 4 FOR 6)::BIGINT
            + CASE
                WHEN substring(task."id" FROM 4 FOR 6)::BIGINT < task."shotId" % 1000000
                THEN 1000000
                ELSE 0
              END
        ) AS inferred_millis
    FROM "VideoTask" task
    INNER JOIN "ProjectWorkspace" workspace
        ON workspace."tenantId" = task."tenantId"
       AND workspace."projectId" = task."projectId"
    WHERE task."id" ~ '^MV-[0-9]{6}$'
      AND task."shotId" BETWEEN 1000000000000 AND 9999999999999
      AND task."createdAt" = workspace."createdAt"
)
UPDATE "VideoTask" task
SET "createdAt" = TIMESTAMP '1970-01-01 00:00:00'
    + inferred.inferred_millis * INTERVAL '1 millisecond'
FROM inferred_legacy_times inferred
WHERE task."tenantId" = inferred."tenantId"
  AND task."projectId" = inferred."projectId"
  AND task."id" = inferred."id";

CREATE INDEX "VideoTask_tenantId_projectId_createdAt_idx"
ON "VideoTask"("tenantId", "projectId", "createdAt");
