# Incident: Production Project Deletion on 2026-07-11

## Summary

Migration `20260710194000_remove_legacy_workspace_payload` treated project `id=1 / 短剧团队 Demo` as disposable demo data. In production that row contained real work, so the migration deleted the project, workspace, materials, and cascading project content.

## Impact

- 1 project temporarily unavailable.
- 15 shots temporarily unavailable.
- 20 video tasks temporarily unavailable.
- 3 video assets temporarily unavailable.
- 10 material records temporarily unavailable.
- Uploaded physical files were not deleted.

## Root Cause

- Disposal was inferred from a legacy ID and display name.
- Destructive data cleanup was embedded in a schema migration.
- The frontend independently filtered the same ID/name from server workspaces and local storage. After database restoration, the project still remained invisible in the actual browser UI.
- The pre-deploy review did not compare production row counts before and after migration.
- The zero-row result after deployment was incorrectly accepted instead of treated as a release failure.
- Recovery verification stopped at database/API checks instead of verifying the final user-visible page.

## Recovery

- Used `/data/backups/manjing-video-db-pre-c7ffc16-20260711-104650.dump`.
- Restored only `Project`, `ProjectWorkspace`, `Material`, `Shot`, `VideoTask`, and `VideoAsset` into the current schema.
- Rebuilt 10 `ProjectMaterial` links and recalibrated the `VideoAsset` sequence.
- Preserved current accounts, memberships, API profiles, audit logs, and migration history.
- Verified 10/10 material files, 4 completed task URLs, and 3/3 video asset URLs.
- Removed all frontend filtering based on legacy project IDs or names so restored projects are visible after refresh.

## Permanent Controls

- `scripts/check-pending-migrations.sh` blocks destructive pending migrations by default.
- `scripts/deploy.sh` now requires explicit approval, a clean worktree, fast-forward-only Git updates, a verified database backup, migration preflight, build success, and only then migration/restart.
- Production data cleanup is separated from schema migrations.
- Every related future task must warn the user and request explicit approval before production database changes.
- Production recovery is not complete until the user-visible workflow is verified, not only database rows and API responses.
