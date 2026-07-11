-- Tasks and materials now have authoritative database tables. Remove their
-- legacy workspace copies so stale browser snapshots cannot resurrect rows.
UPDATE "ProjectWorkspace"
SET "state" = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set("state"::jsonb, '{shots}', '[]'::jsonb, true),
      '{tasks}', '[]'::jsonb, true
    ),
    '{assets}', '[]'::jsonb, true
  ),
  '{materials}', '[]'::jsonb, true
);

-- Remove the exact demo projects that were previously hardcoded by the MVP.
DELETE FROM "Material" material
USING "Project" project
WHERE material."projectId" = project."id"
  AND (
    (project."id" = 1 AND project."name" = '短剧团队 Demo')
    OR (project."id" = 2 AND project."name" = 'demo2')
  );

DELETE FROM "ProjectWorkspace"
WHERE ("projectId" = 1 AND "name" = '短剧团队 Demo')
   OR ("projectId" = 2 AND "name" = 'demo2');

DELETE FROM "Project"
WHERE ("id" = 1 AND "name" = '短剧团队 Demo')
   OR ("id" = 2 AND "name" = 'demo2');
