# Repository Instructions

## Production And Database Safety

For any task involving production deployment, Prisma migrations, database repair, deletion, cleanup, backfill, restore, or direct SQL:

1. Before changing production, tell the user the environment, exact migration/operation, affected tables and estimated rows, backup path, expected downtime, and rollback plan.
2. Obtain explicit user approval before any production database change or destructive operation.
3. Run `npm run db:preflight` before `prisma migrate deploy`.
4. Create and verify a non-empty production database backup before migrations or repairs.
5. Never infer that production data is disposable from an ID, name, legacy marker, demo label, age, or apparent inactivity.
6. Do not put business-row deletion in normal schema migrations. Use a separate reviewed maintenance operation with a read-only impact report.
7. Prefer additive changes and avoid high-risk cleanup after the service becomes stable.
8. Use `scripts/deploy.sh` for production deployment. Do not use `git reset --hard` for deployment.

Read `docs/PRODUCTION_CHANGE_POLICY.md` and `docs/INCIDENT_2026-07-11_PROJECT_DELETION.md` before production database work.
