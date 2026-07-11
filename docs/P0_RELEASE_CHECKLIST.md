# P0 Release Checklist

## Before Production

- [ ] User was shown environment, migrations/SQL, affected tables and estimated rows.
- [ ] User explicitly approved the production change.
- [ ] Local `npx tsc --noEmit` and `npm run build` passed.
- [ ] `npm run test:core-api` passed against the local test service.
- [ ] Production worktree is clean and Git update is fast-forward only.
- [ ] Database backup exists, is non-empty, and has a recorded path.
- [ ] `npm run db:preflight` passed.
- [ ] Pre-migration business counts and identity fingerprints were captured.

## After Migration

- [ ] Business counts and identity fingerprints are unchanged, or an explicitly approved maintenance change explains every difference.
- [ ] PM2 is online.
- [ ] Homepage returns 200.
- [ ] Anonymous `/api/auth/me` returns 401.
- [ ] `npm run smoke:production` passed with temporary credentials supplied through environment variables.

## User-Visible Verification

- [ ] Login page works in a fresh/private browser window.
- [ ] Project list shows the expected real projects.
- [ ] Opening a project shows the expected script, shots, materials, tasks, and video assets.
- [ ] A harmless edit persists after refresh.
- [ ] Material preview and completed video preview/download work.
- [ ] No UI result is inferred solely from database counts or API responses.

The release is not complete until the user-visible verification is recorded.
