# Optional development database refresh

`dev.bat` is unchanged: use it to keep working with the existing local data.
`dev-sync.bat` starts local Docker PostgreSQL, obtains a fresh production snapshot,
replaces the development database, cleans up, and starts the API and frontend.
Run either launcher from Windows with Docker Desktop running and dependencies installed.

## One-time setup

1. Generate the local export credential from PowerShell or Command Prompt in the
   repository. If a previously pasted multiline command is stuck, press **Ctrl+C**
   to return to the normal prompt, then run this single command:

   ```powershell
   node dev/setup-dev-sync-token.mjs
   ```

   The script saves the raw credential in your ignored `.env`, fills the default
   sync URL if missing, and prints only the digest needed by production. Running it
   again reuses a valid existing credential, so it does not invalidate previous setup.
   Other `.env` settings are preserved.

2. In the repository's GitHub Actions secrets, set `DEV_DB_SYNC_TOKEN_SHA256` to
   the printed 64-character digest, without the `DEV_DB_SYNC_TOKEN_SHA256=` prefix.
   Keep the raw token only in local `.env`; never add it to GitHub, `VITE_` variables,
   command arguments, logs, or source control.
3. Deploy the code containing the export service through the normal production
   deployment. The workflow installs the digest in the server environment. An
   absent digest disables the endpoints; a malformed nonempty digest fails the
   deployment configuration check. No migration or extra database privilege is needed.
4. Stop any existing development servers, then launch `dev-sync.bat`.

Production uses the existing Linux PM2 server and runtime database role. Its
application user must be able to create `/var/backups/postgres/dev-sync` under the
existing backup root. These instructions do not configure the alternate production
Docker topology. Local connection settings must match `tienhock_dev_db`: database
`tienhock`, user `postgres`, loopback host, port `5434`, and your existing `DB_PASSWORD`.
The launcher verifies the PostgreSQL cluster identity through both connections.

If production logs report that export storage could not be initialized, log in as
the same OS user running PM2 and provision only the new directory, then restart:

```bash
sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 0700 /var/backups/postgres/dev-sync
pm2 restart tienhock-server
```

The daily production backup waits for an active export to finish (up to 16 minutes)
instead of being skipped because of the export. Manual conflicting operations
report that another backup/restore operation is in progress.

To revoke access, remove the GitHub Actions secret and redeploy. To rotate it, run
`node dev/setup-dev-sync-token.mjs --rotate`, then repeat steps 2–3 with the new
digest. Rotation invalidates the previous local token immediately after the
production process restarts with the new digest.

## What a refresh does

- Takes a consistent, fresh production dump including `public`, `greentarget`,
  and `jellypolly`. Active browser sessions are excluded and cleared before promotion.
- Downloads the compressed PostgreSQL archive over HTTPS to `out/dev-sync/`,
  checking its declared size and SHA-256 digest before copying it into Docker.
- Loads an isolated staging database with a temporary restricted role. It uses
  the same schema, table, column, view, constraint, index, and privileged-object
  checks as the manual SQL Replace button, then swaps database names. The previous
  database stays available until the new one has passed verification.
- Removes temporary files, loader roles, staging resources, and the previous
  database after success. Normal production backups and S3 retention are unchanged.

This replaces local data **and local schema changes**. It does not merge records,
apply migrations, copy environment settings, or download external attachments.
The result represents production at snapshot creation, not continuously live data.
Any local work you need to keep should use `dev.bat` instead.

Neither launcher refreshes data on code reload. Both use the application server's
production-only scheduling rule: invoice status updates, automatic consolidations,
e-Invoice clearing, daily backups, and S3 backup maintenance are disabled in dev.
The startup and delayed pending-invoice checks for Tien Hock and Green Target also
run only when `NODE_ENV=production`, as does startup e-Invoice clearing. Both
automatic invoice and adjustment consolidation workers refuse to run outside
production, regardless of the consolidation settings copied from production.
The endpoint for scheduling pending checks is production-only; immediate manual
status checks, submissions and consolidations remain available using the
MyInvois credentials already configured locally.

## Failure and cleanup behavior

- Missing/invalid credentials, offline production, failed preparation/download,
  corrupt archives, or rejected schemas produce a visible warning and start the
  app with existing dev data only after the database is verified usable.
- Invalid local targets, running development servers, unresolved database recovery,
  or an unusable existing database stop startup. They do not fall back to another target.
- Docker startup is bounded; database readiness gets 90 seconds. Production
  preparation and download each get up to 15 minutes. Restore tooling shares a
  15-minute budget, with bounded SQL waits and a final deadline check before promotion.
- Ctrl+C during refresh prevents application startup. If import is already running,
  allow its restoration/recovery to finish. If the terminal/process is forcibly closed,
  the next startup uses the existing interrupted-replacement recovery procedure.
  Do not manually delete `tienhock_previous_*` databases needed for recovery.
- The sync launcher holds local loopback port `15434` for its whole session to
  prevent another sync launcher from replacing that session's data. Windows releases
  it when the process exits. API/frontend ports are checked before refresh and again
  immediately before promotion. Do not start the ordinary launcher during a refresh.
- Exports expire one hour after creation. Production cleans expired export directories
  on startup and each minute. A server restart invalidates in-memory export IDs;
  abandoned files still expire. Local/container download files older than an hour
  are cleaned on the next sync launch. Cleanup failures are reported and retried later.
- At most one export is prepared at once, with at most three outstanding exports and
  a 30-second interval between requests. Archive downloads are limited to 2 GiB by
  the launcher. A failed export never substitutes an older S3 backup.

The export API uses `Authorization: Bearer <64-character hex token>` on all four
endpoints under `/api/dev-sync/exports`: create (`POST`), status (`GET /:id`), download
(`GET /:id/download`), and cleanup (`DELETE /:id`). It accepts neither a database
name nor a file path. Status metadata contains an ID, status (`preparing`, `ready`,
`failed`), creation/expiry timestamps, byte size and SHA-256 digest. Export access
does not authenticate any other ERP endpoint. Events contain only IDs and outcomes.

## Manual acceptance checks

No production/dev refresh or application tests are run as part of implementation.
Use disposable local data for the destructive/interruption scenarios below.

1. Use `dev.bat`: existing local edits remain and no export appears in production logs.
2. Use `dev-sync.bat`: verify a recent production record in each company after startup;
   note the snapshot timestamp printed in the terminal. Confirm active sessions were
   not copied and existing reports still work.
3. Save backend/frontend code: confirm no additional refresh. Start a second sync
   launcher while the first is running: it must stop before fetching or replacing data.
4. Remove the local sync token or use an invalid token, then retry with a usable local
   database: expect an explicit warning followed by normal startup using existing data.
5. Repeat while production is unreachable. A new/empty local database must stop instead
   of reporting that usable data was preserved.
6. On a disposable local setup, exercise truncated downloads, checksum mismatch,
   missing required tables, and failed imports. None may promote an invalid database.
7. Interrupt an import and each rename stage on disposable data. Restart and confirm
   that recovery selects a valid database and retains necessary recovery resources
   if it cannot finish.
8. Confirm the manual SQL Replace button and its status polling still work. Confirm
   regular production create/download/restore operations retain their existing behavior;
   an in-progress export must prevent a concurrent restore.
9. With an HTTP client, verify absent/wrong/duplicate bearer headers are rejected,
   the export token cannot access `/api/backup/list` or `/api/invoices`, guessed IDs
   cannot download data, and a client cannot specify paths or database names.
10. Confirm successful refreshes delete temporary local/container/production exports.
    Leave an abandoned export for an hour and verify expiry cleanup, including after
    a production process restart. Normal backup lists and S3 objects stay unchanged.
11. Leave development running across a scheduled-job time: no business/backup cron
    job should run. Production retains all five existing schedules.
12. Start or reload development with pending invoices: neither pending-invoice
    initialization message nor startup e-Invoice clearing should appear after
    15 seconds. Updating an invoice to pending must not schedule a five-minute
    background check. Manual status checks should still work, while
    `POST /api/invoices/schedule-pending-checks` returns 403 outside production.
