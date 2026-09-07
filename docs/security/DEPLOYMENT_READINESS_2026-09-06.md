# Deployment preparation, rollout and verification ? 6?7 September 2026

The workflow import fix (`00636fdd`) and Nginx CORS fix (`1af030ca`) are committed.
The publication warnings in the earlier checkpoint notes below are historical.
The Restore helper is installed and tested; its accompanying app changes still
need publication. The reported HR save failure is resolved on the live server.

Later verification: [Restore feature](#restore-feature-verification) ?
[HR Mee/Bihun saves](#hr-save-verification). For ongoing installation and operation,
use the [server runbook](../../prod/server/README.md).

**Production rollout completed on 7 September 2026, around 00:49 Malaysia time (6 September UTC).** The security backend now runs with `tienhock_app`; both frontend domains serve the cookie-session release. The preparation record below is historical; the rollout results supersede its pending-deployment statements.

## Production rollout and deployment failure recovery

GitHub Actions run [34045948125](https://github.com/matt-goh/tienhock/actions/runs/34045948125) checked out production revision `3128603352573caaf8b93c78a3f5665ef3d8e8b4`, installed dependencies and passed its frontend build/type check. It then failed before PM2 restart: the inline preflight used a named dynamic `pg.Client` import, which is undefined with the installed CommonJS package on Node 20.19.6. The earlier preparation verified the privilege-check helper, but missed this exact workflow import. The local workflow now imports the default export and calls `new pg.Client(...)`; that exact corrected command passed against production. **The workflow correction still needs committing and publishing through the normal master-to-production release process. Re-running the old failed run alone will use its old command.**

Completed the remaining restart directly over SSH without repeating the successful build. PM2 changed from PID 2745956 to 2798625 and remained online without further restarts throughout verification. A read-only PostgreSQL activity check after mobile requests confirmed the running application connects as `tienhock_app`. The environment file is mode 600 and the mobile-key digest is unchanged.

Nginx had reported a successful reload, but its error log showed that switching from the wildcard listener to loopback failed with `Address already in use`. After validating the configuration, a brief Nginx restart applied the address change. Verified listeners: Nginx on `127.0.0.1:80` and `[::1]:80`, Node on `127.0.0.1:5000`, PostgreSQL on loopback port 5432. Cloudflare Tunnel traffic remained reachable afterward. Future deployments can reload the now-established loopback listener normally; a successful reload command alone is insufficient evidence that a listener change took effect.

Live verification after both restarts:

- All five mobile download routes returned HTTP 200 with the installed app's existing credential, including `/api/staffs/get-salesmen?fields=minimal` from commit `3c08e5b2c226bb55e2f8c4509cee0ae5f78c37ac`.
- The mobile key received HTTP 403 for backup administration and unsupported `fields=full`.
- Unauthenticated office requests received HTTP 401 with the correct CORS origin for each frontend domain; an untrusted origin received HTTP 403.
- Both frontend HTML pages and their JavaScript asset returned HTTP 200, with the new cookie-session code present. These are delivery checks, not an interactive sign-in test.
- The public restore-status endpoint returned HTTP 200 with `IDLE`.

The GitHub run remains marked failed because recovery was completed over SSH. Existing employees must refresh and sign in again. An actual browser sign-in, installed-phone invoice submission, full business regression and the next scheduled backup still need checking. No employee password or business record was changed by these verification requests. Known dependency advisories remain outside this deployment-command fix.

## Browser preflight correction — 7 September Malaysia time

The first live browser backup check exposed a missing production preflight handler: `OPTIONS /api/backup/list` reached the backend administrator guard without a session cookie and returned HTTP 403. The earlier rollout checks covered actual GET responses but missed this browser preflight. Nginx now answers OPTIONS with HTTP 204 before proxying, using the existing exact-origin, method, header and credential allowlists. Actual requests still pass through authentication and administrator checks.

Applied the tracked configuration correction to Hetzner with the existing deployment helper; `nginx -t` and reload passed. PM2 remained at PID 2799199 throughout this correction. Live preflights for GET backup listing, POST backup creation and PATCH staff updates passed on both frontend origins. Unauthenticated backup GETs still returned HTTP 401; an untrusted origin received no `Access-Control-Allow-Origin`. These checks did not create backups or edit staff records. The Nginx correction is also in the local working tree and must be published before the next production deployment so that deployment retains it.

## Completed

- Created `tienhock_app` on the production PostgreSQL server, enabled login with a generated password, and applied the tracked role setup. It has normal business-data permissions in all three schemas without database ownership, superuser, role creation, replication or row-security bypass. The privilege-check helper and the application's production TLS pool passed against `tienhock_prod`; the exact workflow command was corrected during the subsequent rollout described above.
- Created the GitHub Actions secret **`ERP_DB_PASSWORD`**. The pending workflow uses it for the backend's `DB_PASSWORD` environment variable and checks that it is present before connecting to Hetzner. The older GitHub secret `DB_PASSWORD` stays unchanged so the currently deployed workflow remains usable until rollout. No password values are recorded here.
- Confirmed **MILTI, TIMOTHY.G, HELEN and MATTHEW** are active OFFICE accounts in production. No live employee passwords, identities or business records were changed.
- Confirmed `production_worker_orders` exists. The role has DML grants on 100 public, 49 Green Target and 36 Jelly Polly tables. Existing application tables and sequences are owned by postgres; the reviewed schemas contain no SECURITY DEFINER functions.
- Confirmed the root-owned Nginx deployment helper and restricted sudoers file exist. Both the existing Nginx configuration and the pending loopback configuration passed `nginx -t`. The live site was not reloaded.
- Parsed both workflow YAML files and verified the new secret-to-environment mapping. GitHub Actions itself has not run for this release.

## Recovery copy and restore rehearsal

Saved a fresh custom-format production dump with session data excluded. The server recovery directory is `/var/backups/postgres/security-rollout-2026-09-06`, owned by root with mode 700. It also holds private copies of the previous environment, Nginx configuration and role definitions. These files contain sensitive material and must stay out of Git and chat.

An independent copy of the dump is on this computer at:

`C:\Users\matia\TienHock-Recovery\2026-09-06\pre-rollout.dump`

The Windows recovery directory has access restricted to the current Windows user and SYSTEM. The dump is 5,056,352 bytes; matching server/local SHA-256:

`452fbb5b09ee9d5670e4cf4ca2af830c241867ec1d17e634b5099849c1ee373f`

Restored it into the separate database `tienhock_security_verify_20260906`. All 185 business tables restored, with zero restored sessions. Row counts matched production for all 184 non-session tables, and journal counts/debit/credit totals matched. The database currently references zero supporting-document objects, so no document downloads were needed for this restore point. This is a restore check for this copy, not a guarantee about every future backup or the recovery time after an incident.

The temporary database was removed after verification. The tested backend source archive and non-sensitive validation reports are retained beside the local dump. The generated database password is kept separately in a root-only file on the server and in the encrypted GitHub secret.

## Backend checks with real restored data

Ran the pending backend as the `tienhock` OS user on loopback port 5055, using `tienhock_app` and the isolated restored database. External MyInvois and AWS credentials were deliberately absent from that test process. Only its restored MATTHEW record received a temporary test credential; the database was deleted afterward. The production shared-password policy stays unchanged.

Passed:

- Production-mode startup, office login, server-issued HttpOnly cookie and administrator identity.
- Office reads for sessions, staff, products, customers, Green Target customers and Jelly Polly staff.
- Mobile downloads for salesmen with `fields=minimal`, invoice IDs, customers, products with supported filters, and customer-product mappings. The isolated server used a temporary test mobile key with the same authentication implementation; the live mobile-key digest was unchanged.
- Rejection of unsupported mobile query fields, mobile backup administration and an untrusted browser Origin.
- A custom-format dump created by the new backup helper with the restricted database role under the normal OS user. Its temporary file was removed.

The test process was stopped. No frontend build, type check or lint was run, in accordance with the repository instructions. A real installed-phone submission, invoice persistence, external MyInvois submission and full business-workflow regression remain unverified. Previous authentication unit/HTTP tests also passed under test and production settings.

## Release checklist recorded before rollout

1. Review and commit the intended pending changes, including the new untracked helper files and workflow. No push or deployment was performed during this preparation.
2. Deploy the backend and Cloudflare Pages frontend together during the agreed quiet window. The existing workflow installs Nginx and restarts PM2. Its database preflight is now configured to pass with the prepared role; normal build/deployment checks still have to pass.
3. Sign in with an existing employee password and check both frontend domains. On an installed salesman phone, sync and submit a controlled invoice, then confirm it appears correctly in the ERP. Create/download a backup and verify the next scheduled backup.
4. After the new release is healthy and rollback no longer requires the old configuration, retire obsolete provider/database credentials and the older deployment secret. Keep maintenance credentials outside the app environment. Persistent protected-backup retention and provider MFA remain separate operational work from this one-time rollout preparation.

No further account-name or password-policy decisions are needed for this preparation. Shared OFFICE passwords and the legacy mobile key remain the owner's accepted exceptions. This preparation does not certify the entire project or close those risks.

Machine-readable results: [deployment readiness evidence](DEPLOYMENT_READINESS_EVIDENCE_2026-09-06.json). GitHub secret handling follows its [Actions secrets API](https://docs.github.com/en/rest/actions/secrets#create-or-update-a-repository-secret); PostgreSQL credentials were set through its [password administration mechanism](https://www.postgresql.org/docs/16/auth-password.html).

## Restore feature verification

Verified on 7 September 2026 (Malaysia time).

The owner requested that the existing production Restore button be reinstated.
The earlier production restriction is superseded by this change. MILTI,
TIMOTHY.G, HELEN and MATTHEW retain their existing shared-password accounts and
can restore a backup selected from the list after the existing confirmation.
Plaintext SQL upload/replacement remains the existing development-only feature.

The frontend button is no longer hidden in production. The backend no longer
rejects production restoration outright. It checks and calls the root-owned
`restore-tienhock-backup` helper with a validated filename. Normal API requests
still use `tienhock_app`. The helper executes the restore as the separate
`tienhock_restore` local-peer OS/database identity, with no superuser, role
creation, database creation, membership or server-program-execution privileges.
No new password or deployment secret is needed.

Before restoring, the helper saves a private recovery dump outside the app's
writable directories. It transfers only application-schema object ownership to
the restore role; the database stays postgres-owned. The selected restore,
session deletion and runtime access grants execute in one transaction. A failed
restore rolls back those changes; successful restoration signs everyone out.
The root-owned helper and its sudoers entry must be installed separately from
the app checkout. Installation, recovery-copy retention and limitations are in
[the server runbook](../../prod/server/README.md#production-restore-button-setup).

### Verification

Used PostgreSQL 16 on Hetzner and the isolated database
`tienhock_restore_verify_20260907`, initially loaded from the independently
verified production dump. Production business data was not restored or edited.

- A selected backup restored the expected test-marker value.
- Old sessions contained in that backup were removed.
- Runtime table grants returned, while runtime schema creation stayed denied.
- The real application's restricted credentials connected to the restored copy;
  its startup privilege check and every table's four DML grants passed.
- An injected error after restoration and grant/session work rolled back the
  changed rows and session deletion together.
- Traversal, symlink and option-like filenames were rejected.
- The restore identity was denied attempts to become a superuser or execute a
  PostgreSQL server-side program.
- The existing 17 authentication/mobile tests passed; translation key symmetry
  passed. Backend and helper syntax checks passed. No frontend build, type check
  or lint was run.

The temporary database and its test snapshots were removed after verification.
The server helper and restricted sudo rule are installed, and the application's
OS account passed the installed helper's readiness check. Production business
rows and employee passwords were not changed. The server helper is provisioned
separately; publish the accompanying frontend
and backend changes through the usual master-to-production deployment to make
the button available. This feature reinstatement does not execute a production
restore. Shared credentials still permit account impersonation, and a compromised
application process can invoke its delegated restore operation. The helper
limits that operation's scope; it does not make authorized restoration harmless.

The source backup and pre-restore recovery dump are retained. An operator must
monitor recovery-directory disk usage and remove obsolete copies after verifying
the result. These server copies do not replace ongoing independently protected
backups. PostgreSQL archives contain executable definitions, so only this
company's trusted complete backups belong in this workflow. See PostgreSQL's
[restore documentation](https://www.postgresql.org/docs/16/app-pgrestore.html)
and [psql transaction options](https://www.postgresql.org/docs/16/app-psql.html).

Machine-readable verification: `subsequentRestoreFeatureVerification` in the [deployment evidence](DEPLOYMENT_READINESS_EVIDENCE_2026-09-06.json).

## HR save verification

Verified on 7 September 2026 (Malaysia time).

**The reported HTML/JSON failure is resolved on the current live server.** No
additional production code change or deployment was needed for this incident.
All times below are Malaysia time.

### Confirmed incident

Nginx recorded 25 failed requests to `/api/daily-work-logs` between **6 September
18:06:51 and 19:04:09**: 14 POSTs and 11 PUTs, all HTTP 500. Every matching error
reported `open() /var/lib/nginx/body/[temporary-file] failed (13: Permission denied)`.
The PUT failures targeted work log 847. These requests failed in Nginx before
reaching the payroll handler; the frontend then attempted to parse Nginx's HTML
error page as JSON, producing the reported `Unexpected token '<'` message.

Mee and Bihun use the same save API as Boiler, but contain more employee/activity
data. Nginx writes request bodies that exceed its memory buffer to temporary
files, explaining why the smaller Boiler saves could work while larger entries
failed. See the [Nginx request-body buffer documentation](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_body_buffer_size).
The saved fixtures used below were approximately 29 KB for Mee, 23 KB for Bihun
and 3 KB for Boiler; they are representative records, not captures of HR's
failed submissions.

The current Nginx worker runs as `www-data`; `/var/lib/nginx/body` is owned by
`www-data:root`, mode `0700`, and a write-access check under that worker identity
passed. The directory metadata changed at **7 September 00:35:57**, during the
earlier deployment. The exact action that originally caused the permission
mismatch cannot be established from the retained evidence. It was a server
temporary-file permission failure; these logs do not implicate the payroll
transaction changes or restricted database role.

### Verification

Production revision: `e7b65b3eb87773387886049e5ab00db8a3db7230`.

- Public HTTPS POST and PUT probes to the affected API, with bodies of 1,039,
  65,551 and 524,303 bytes, all reached authentication and returned valid JSON
  HTTP 401 with the correct `https://tienhock.com` CORS origin. These probes
  deliberately carried no credentials and could not save business data.
- A separate database copy, `tienhock_hr_verify_20260907`, was tested using the
  deployed payroll router, production authentication middleware, a temporary
  session for an ordinary OFFICE account, and the actual restricted
  `tienhock_app` connection. Copied sessions were cleared before testing; the
  production database-role guard passed. The test server listened only on a
  temporary loopback port.
- Existing submitted records supplied the fixture data. Both create (HTTP 201)
  and update (HTTP 200) passed for each section. Database reads verified the
  persisted entry/activity counts and total calculated amounts against each
  submitted payload:

| Section | Employee/job entries | Activities | Create | Update |
| --- | ---: | ---: | --- | --- |
| Mee | 11 | 134 | Passed | Passed |
| Bihun | 12 | 102 | Passed | Passed |
| Boiler | 2 | 14 | Passed | Passed |

All six saves finished in under 150 ms in this isolated check. No production
payroll records were changed. The test database and temporary server harness
were removed. The current Nginx error log contained no matching daily-work-log
permission failures after verification.

Machine-readable results: `subsequentHrSaveVerification` in the [deployment evidence](DEPLOYMENT_READINESS_EVIDENCE_2026-09-06.json).

### HR follow-up and limits

HR can refresh the app, sign in again if requested, check which entries already
exist, and retry the missing Mee/Bihun saves. There were also successful saves
during the incident window, so check the list before re-entering records.
The 25 requests rejected by Nginx did not reach the database.

This verifies the reported server failure and representative saves using the
current database permissions. It does not replay HR's unsaved browser state or
certify every payroll workflow, calculation, leave combination or concurrent
save. No frontend build, type check or lint command was run. No application code
was changed for this verification; the previously pending restore-feature work
remains separate.
