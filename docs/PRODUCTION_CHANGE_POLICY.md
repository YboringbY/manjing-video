# Production Change Policy

## Required User Notice

Before any production deployment, database migration, data repair, deletion, cleanup, or backfill, explicitly tell the user:

1. Which environment and database will change.
2. Which migrations or maintenance statements will run.
3. Which tables and estimated row counts may be affected.
4. Where the verified pre-change backup will be stored.
5. Whether downtime is required and how rollback will work.

Do not continue with a destructive operation until the user explicitly approves it.

## Migration Rules

- Schema migrations must not delete business rows.
- Do not put `DELETE`, `TRUNCATE`, `DROP TABLE`, `DROP COLUMN`, or equivalent cleanup into a normal Prisma migration.
- Historical/demo cleanup must be a separate maintenance script with a read-only impact report and explicit user approval.
- Names and IDs are not sufficient proof that a row is disposable. Production rows may retain legacy demo identities while containing real user data.
- Run `npm run db:preflight` before `prisma migrate deploy`.
- A non-empty database backup is mandatory before every production migration.
- Stop the application for repairs that restore or rewrite related tables, and use a transaction whenever possible.

## Stability Phase

After the service is stable:

- Prefer additive schema changes.
- Batch high-risk migrations into scheduled maintenance windows.
- Reduce compatibility cleanup and large backfills.
- Keep data removal out of routine feature releases.
- Require a separate review for database migrations and production deployment.

## Deployment Command

Use `scripts/deploy.sh`; do not use `git reset --hard` or call `prisma migrate deploy` directly in routine production releases.

The script requires:

```bash
PRODUCTION_DEPLOY_APPROVED=yes scripts/deploy.sh
```

Destructive pending migrations are blocked unless their exact names, a change reference, and a verified backup are supplied. That override is only permitted after explicit user approval.
