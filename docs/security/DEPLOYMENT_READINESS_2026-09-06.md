# Deployment preparation — 6 September 2026

The database account, deployment secret and server prerequisites are prepared. **The security application changes have not been deployed.** The existing production process and its environment remain in place. This record supersedes the unverified infrastructure status in the 5 September remediation report.

## Completed

- Created `tienhock_app` on the production PostgreSQL server, enabled login with a generated password, and applied the tracked role setup. It has normal business-data permissions in all three schemas without database ownership, superuser, role creation, replication or row-security bypass. Both the deployment preflight and the application's production TLS pool passed against `tienhock_prod`.
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

## Remaining release steps

1. Review and commit the intended pending changes, including the new untracked helper files and workflow. No push or deployment was performed during this preparation.
2. Deploy the backend and Cloudflare Pages frontend together during the agreed quiet window. The existing workflow installs Nginx and restarts PM2. Its database preflight is now configured to pass with the prepared role; normal build/deployment checks still have to pass.
3. Sign in with an existing employee password and check both frontend domains. On an installed salesman phone, sync and submit a controlled invoice, then confirm it appears correctly in the ERP. Create/download a backup and verify the next scheduled backup.
4. After the new release is healthy and rollback no longer requires the old configuration, retire obsolete provider/database credentials and the older deployment secret. Keep maintenance credentials outside the app environment. Persistent protected-backup retention and provider MFA remain separate operational work from this one-time rollout preparation.

No further account-name or password-policy decisions are needed for this preparation. Shared OFFICE passwords and the legacy mobile key remain the owner's accepted exceptions. This preparation does not certify the entire project or close those risks.

Machine-readable results: [deployment readiness evidence](DEPLOYMENT_READINESS_EVIDENCE_2026-09-06.json). GitHub secret handling follows its [Actions secrets API](https://docs.github.com/en/rest/actions/secrets#create-or-update-a-repository-secret); PostgreSQL credentials were set through its [password administration mechanism](https://www.postgresql.org/docs/16/auth-password.html).
