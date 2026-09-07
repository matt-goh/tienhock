# Security remediation — 5 September 2026

**Later owner correction:** The production Restore button is being reinstated
through a dedicated server helper; see [7 September restore reinstatement](DEPLOYMENT_READINESS_2026-09-06.md#restore-feature-verification).
That record supersedes this report's server-only restoration restriction.

This records the repository changes for the first ten findings in the [original review](SECURITY_REVIEW_2026-09-04.md). It is **not a compliance certificate**. The [deployment readiness and rollout record](DEPLOYMENT_READINESS_2026-09-06.md) documents the later production role setup, recovery rehearsal and completed application rollout on 7 September Malaysia time. Its rollout section supersedes the historical cutover checklist below.

**The application is now running with the restricted database role.** The server intentionally refuses privileged production database connections. Per the owner's updated decision, existing shared OFFICE passwords remain: there is no password-reset migration or personal-password setup step. Employees must sign in again because browser sessions now use server-issued cookies. The rollout record lists outstanding manual checks and the workflow correction still awaiting publication.

## Decisions already applied

- Security administrators: **MILTI, TIMOTHY.G, HELEN, MATTHEW**, enforced in `src/middleware/security.js`. They manage OFFICE membership/login identity and backup creation, listing, download and deletion.
- Ordinary eligible OFFICE users retain the existing business access across companies. This is deliberately a small administrative boundary, not a new department-by-department permission system.
- Existing mobile compatibility remains. Its shared key and its permitted invoice changes remain an **accepted temporary exception**, not a closed finding.
- **Shared OFFICE passwords retained by explicit owner decision.** Existing hashes are preserved; no forced password change, reset UI, reset API or password migration remains. New OFFICE access reuses the provisioning administrator's existing stored hash. Removing OFFICE access clears the hash and ends sessions. Ordinary profile edits preserve existing passwords; responses omit hashes. Shared credentials weaken the administrator boundary: somebody who knows the shared password and an administrator's login IC can sign in as that administrator. Logs identify an account, not reliably an individual person.
- Production full-database restoration requires server maintenance access. The web app no longer receives the database ownership required to drop and recreate application tables. Development restore remains available; the existing local-only SQL replacement workflow is preserved.

## Findings: what changed and what remains

| Finding | Repository change | Remaining work |
| --- | --- | --- |
| S01 — command/path injection | Backup names and filenames are bounded and allowlisted; paths are derived under the backup directory; commands use argument arrays and environment variables. Host downloads use private temporary directories. Dump symlinks are rejected. | Manual malformed-filename and backup/download checks on development. |
| S02 — SQL injection | Three payroll bulk-insert paths now bind every value, including imported/source fields. Numeric inputs are validated and inserts are chunked. Raw SQL used to reinsert restored sessions was removed. | Manual payroll creation, batch and reprocessing checks with quotes and rejected input. |
| S03 — administrative access | The four named administrators are checked on the server. OFFICE assignment, login identity, reserved administrator IDs and office-account deletion are protected. Security actions log actor IDs without credentials. | Confirm business access and administrator workflows manually. Shared credentials permit administrator impersonation when the login IC is known. Logs are neither immutable nor proof of the individual responsible. |
| S04 — shared passwords | Staff editing preserves passwords and replies omit hashes. New OFFICE access reuses the provisioning administrator's stored hash rather than a source-code constant. | **Accepted exception:** shared passwords remain at the owner's request. Personal-password features and the disabling migration were removed before deployment; existing accounts are not reset. |
| S05 — sessions | Server generates 256-bit tokens and places them in host-only HttpOnly cookies, Secure in production, SameSite=Strict. Browser storage contains only a non-secret marker. Old bearer headers no longer authenticate. Exact browser-origin checks protect cookie requests and login. Session URLs contain no token. Idle limit is 8 hours; absolute limit is 12 hours. Logout also works after expiry/reset. | Coordinated frontend/backend deployment, then cookie/CORS/expiry checks on both domains. |
| S06 — guessing/MFA | Generic login failures, bounded input, bcrypt comparison for missing accounts, and account/IP throttling before credential work. Nginx supplies the visitor address from the local Cloudflare tunnel; Express trusts loopback only. | **Partial:** no ERP MFA added. Enable/verify provider-account MFA and decide whether ERP administrators need an additional factor. Throttle state resets on a process restart; it is sized for the current single PM2 instance. |
| S07 — exposed credentials | Hardcoded OFFICE password assignment removed in TH and JP; deployment env files are private and environment variants are ignored. A checksum-pinned Gitleaks CI job scans the tracked tree with redacted output. Mobile route restrictions are retained. | **Open/accepted exception:** rotate provider credentials and remove stale local copies; the old mobile credential remains until the client can be updated. History cleanup does not revoke a credential. |
| S08 — recovery | Fresh daily backup at 03:00 Malaysia time, incomplete dumps excluded from listing/sync, session rows excluded from new dumps, failed uploads reported, and completed local copies retained. S3 listing paginates and filters backup keys; retention cannot select nested purchase attachments. New objects use `production/backups/`; legacy root dumps remain supported. SQL downloads retain the local recovery copy. The UI warns when no backup within 36 hours is listed. | **Partial:** ongoing protected-version retention and an external failure alert still require operational setup. A separate local recovery copy and a successful isolated restore were verified on 6 September; see the readiness record. Local copies and the current shared S3 credential are not independent protection from application compromise. |
| S09 — DB administrator/origin | Runtime-role setup script and startup privilege checks added; deployment uses `tienhock_app`. Runtime DDL for production worker ordering replaced by a schema-presence check. Node and system Nginx bind to loopback. | Role/grants/password preparation passed on 6 September. Deploy to activate that role in the live application; external firewall verification remains outstanding. The Docker Compose topology needs an explicit HOST=0.0.0.0 if used; it is not the live deployment. |
| S10 — transaction integrity | All 54 audited pool-level BEGIN calls were replaced: login plus 53 business handlers/helpers. One acquired client runs each transaction; it is released before post-commit reprocessing. Early exits roll back. Sixteen batch paths use per-item savepoints so rejected rows do not abort the remaining batch. | Manual concurrent-save and forced-error checks. This does not certify every calculation or eliminate every possible business race. |

The four administrator accounts can still download sensitive database contents. Ordinary OFFICE users can still change business records within existing workflows. Shared passwords mean the four-ID restriction does not establish that only those four people can act as administrators. A stolen or malicious authorized account can cause harm; protected recovery copies remain necessary.

## Small-business decisions still needed

1. **Cutover window.** The owner has offered the quiet Sunday maintenance window. Prepare the database-role change and recovery copy before using it. Employees retain their passwords and sign in again after the frontend/backend update; no password distribution is needed.
2. **Recovery ownership and loss tolerance.** Name a server recovery owner and a backup person. Daily backups target at most about one day's lost work when successful; actual recovery time remains unmeasured. If that loss is too much, increase frequency or add PostgreSQL point-in-time recovery.
3. **Protected recovery storage.** Recommended starting point: versioning plus 30 days of governance retention, with the app denied permanent version deletion, retention changes and governance bypass. A separate protected copy with credentials outside the ERP process provides stronger separation. Confirm the retention/storage budget before enabling it.
4. **MFA.** Enable MFA on GitHub, Cloudflare, AWS and Hetzner owner/deployment accounts now. ERP admin MFA can be a separate, focused follow-up. Do not place an untested Cloudflare Access requirement across mobile routes while the existing app must remain compatible.
5. **Mobile retirement date.** Nominate a future client update and key retirement date. Until then, someone with that exposed key can use its allowlisted sales operations, including permitted invoice deletion.

These operational items are material security work. They cannot be truthfully marked complete from a repository edit.

## Deployment cutover

These are the Linux Hetzner cutover instructions. Steps 1, 3?6 were prepared and checked on 6 September as recorded in the [readiness report](DEPLOYMENT_READINESS_2026-09-06.md); do not generate another database password without also updating its matching GitHub secret. The live application was not stopped or deployed.

The restricted database account is the ERP server's PostgreSQL login, `tienhock_app`. It can read and change business rows but has no database-owner or superuser powers. Its password is now in GitHub Actions secret **`ERP_DB_PASSWORD`**, which the pending workflow writes to the backend environment variable `DB_PASSWORD`; employee passwords stay as they are. This one-time prerequisite is completed. The older GitHub `DB_PASSWORD` secret was kept unchanged so the old production workflow remains usable until rollout. The workflow checks the prepared role but does not create it.

1. Verify a current recovery copy of both the database and uploaded documents, stored somewhere the ERP cannot erase. Save the existing deployment configuration privately. Finish the manual development checks below before changing production.
2. Arrange the maintenance window, stop `tienhock-server` with PM2, and pause any other writers. Keep server access available.
3. As the database owner, apply `prod/server/setup-runtime-role.sql` to `tienhock_prod`. Use `psql -v ON_ERROR_STOP=1`. There is no password migration in this release. Do not use an earlier copy of the removed `2026-09-05_security_accounts.sql`: it would disable existing OFFICE passwords.
4. At an interactive psql prompt, run `\password tienhock_app`, then `ALTER ROLE tienhock_app LOGIN;`. Put the new application-role password into GitHub's `ERP_DB_PASSWORD` secret. This is already done for this release. Keep the postgres/maintenance password outside the application environment.
5. Confirm the intended administrator IDs are existing, active OFFICE accounts with working credentials. Keep `MOBILE_API_KEY_SHA256` set to the digest of the installed app's current key. No new mobile key or employee password is required for this update.
6. Ensure `production_worker_orders` and all previously required schema migrations exist. The runtime role will not create missing tables. The setup script grants data/sequence access in public, greentarget and jellypolly and default privileges for future objects created by postgres; future migrations by a different owner need corresponding grants.
7. Deploy the backend and Cloudflare Pages frontend together. The new backend requires cookie authentication, so cached old frontends need refreshing. The workflow's database preflight must pass before PM2 restart. Install/reload the tracked Nginx configuration through the existing root-owned helper.
8. Log in using the existing IC and password, then verify each role and both frontend domains. Use an installed salesman phone to sync its catalogue and submit a controlled test invoice. Create a backup, download it, confirm S3 contents, and check the following morning's scheduled backup.
9. Revoke old database/provider credentials after replacements work. Record who completed each step and when. If preflight fails, keep the service in maintenance while correcting configuration; do not bypass the role check to resume with postgres.

No dev database writes were performed during this remediation. After the owner corrected TIMOTHY to TIMOTHY.G, a read-only development check confirmed all four approved IDs (MILTI, TIMOTHY.G, HELEN and MATTHEW) are active OFFICE accounts. The server allowlist uses the corrected exact ID. A subsequent production check also confirmed all four IDs; see the 6 September readiness record. Development has neither the discarded password column nor the new runtime role, and does not require that password column.

## Credential rotation record

The operator should complete this without recording secret values:

| Credential family | Required action | Verification |
| --- | --- | --- |
| Historical Cloudflare Tunnel token | Revoke/replace any exposed token that is not demonstrably retired; update the actual cloudflared service. | Tunnel remains healthy; old token is rejected. |
| Historical/local MyInvois client secrets | Identify which TH/GT/JP integrations the exposed values belong to, rotate active ones, and update the matching MYINVOIS_* GitHub secrets. | Correct company integration works with the replacement; old credential is retired. |
| Database credentials | The new tienhock_app password is configured as ERP_DB_PASSWORD for the pending workflow. Retire obsolete credentials after rollout; the existing live process still uses its previous environment until deployment. | Runtime preflight and all-company business access pass. |
| AWS/deployment/SSH credentials | Review historical candidates and revoke any whose exposure/revocation is unresolved. Limit replacement privileges and use MFA for the owning accounts. | Storage/deployment work and old credentials no longer grant access. |
| Salesman mobile key | Keep temporarily per the approved compatibility exception. Plan individual revocable credentials and ownership checks, then revoke the old shared key. | New mobile release works; retired key fails and users cannot act as other salespeople. |

After replacing values, remove literal credentials from ignored alternate Compose files and stale local copies. The tracked-tree CI scan intentionally does not reclassify existing history as clean. Enable the check as a required PR check in repository settings; that setting was not changed. CI does not revoke exposed credentials.

## Protecting recovery copies

S3 Object Lock protects **object versions**. A normal delete can still hide a protected version with a delete marker, so recovery must know how to list versions and retrieve the retained one. Governance retention can be bypassed by an identity with the bypass permission; the application must not have it. See [AWS Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html).

For the current bucket, review the app identity's effective policies and deny permanent version deletion, changes to bucket versioning/retention/lifecycle/policies, retention overrides and governance bypass. Protect uploaded purchase documents as well as dumps. Do not grant these management permissions merely because the app needs ordinary object upload/download/delete.

A separate locked recovery copy should use a provider replication role or backup operator whose management credentials are not present on the ERP host. This configuration was not created or verified. Keeping a second access key in the same Node process does not provide that separation.

Preserved retention behavior: local completed dumps are kept for 180 days; the S3 cleanup considers backup objects older than 1,095 days. Neither is a guarantee of immutable storage. Production upload streams avoid buffering the dump in Node memory; Windows/macOS Docker backup uploads retain the existing 50 MB buffer limit. Larger development uploads need a streaming follow-up. A valid dump catalog is a format check, not proof of full restorability.

## Server restore procedure

The production web restore endpoint intentionally returns 403. The recovery operator uses an owner connection outside the Node process.

1. Retrieve an approved clean dump/version and its matching document objects. Copy it into a private directory readable by the postgres operating-system account. Preserve the current database and incident logs.
2. With application writers stopped, restore into a **new, empty staging database** using `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges --dbname=<staging_database> <approved_dump>`. The operator chooses and verifies the database/file names. PostgreSQL documents these [restore options](https://www.postgresql.org/docs/16/app-pgrestore.html).
3. Check expected schemas, tables, dates, invoice balances, receipt/payment links, posted journal balance, payroll totals and the existence of uploaded documents. Reconcile the chosen restore point with the company.
4. Apply any required business schema migrations newer than the dump to staging, and clear `public.active_sessions`. This release requires no password schema migration. If credentials may be compromised, have the recovery operator replace affected credentials before reopening access; retained shared passwords are an acknowledged risk.
5. Promote the verified staging database during maintenance, keeping the prior database under a different name for recovery. Reapply runtime grants, rerun the production privilege preflight, restart, and run a business smoke check.
6. Record the restore point, elapsed recovery time and any missing work. Rehearse against an isolated database before making a production-recovery promise.

## Verification recorded

Machine-readable results: [remediation evidence](SECURITY_REMEDIATION_EVIDENCE_2026-09-05.json). Workflow YAML was initially reviewed manually and subsequently parsed successfully on 6 September. The CI job has not run.

- Parsed **728** current repository JavaScript/TypeScript sources (excluding declaration files) for **syntax only** after removing the personal-password feature; no parse errors in the recorded pass. This is not a TypeScript type check.
- Re-scanned the audited transaction pattern: **zero `pool.query("BEGIN")` calls remain**.
- `npm run i18n:report` confirmed matching ms/zh-Hans keys.
- Rollout follow-up: **17 authentication tests passed in each of two runs**, with normal test and production authentication settings, including loopback HTTP checks. It covers the `3c08e5b2c226bb55e2f8c4509cee0ae5f78c37ac` salesman query fix, the mobile route/query allowlist, cookie-free mobile authentication, the actual salesman-list handler with fixture rows, cookie login with existing shared passwords, and administrator provisioning without a password migration. The mobile allowlist, credential-validation helpers and invoice/e-Invoice/catalogue handlers are unchanged from that commit. Database results are mocked; this does not verify invoice persistence, the installed phone or external MyInvois submission. Keep the existing mobile key digest during deployment.
- Read-only development metadata showed no application-schema SECURITY DEFINER functions and no tables owned by a role other than postgres. This is not a production observation.
- The initial 5 September pass ran no build, type check, lint, live-database application test, database migration, live exploit, restore, cloud change or deployment. The [6 September preparation](DEPLOYMENT_READINESS_2026-09-06.md) adds a real restore rehearsal, backend checks against the restored database, production role/preflight checks and the GitHub secret. It still does not include a frontend build or application deployment.

## Manual checks before deployment

Use the development database and disposable business records. Keep real passwords and cookies out of saved screenshots/logs.

- Login: existing correct/incorrect credentials; >72-byte passwords; double login; logout; logout after expiry/revocation; repeated attempts yield 429. Confirm no password-change prompt appears and the login response/localStorage never contains the cookie token.
- Cookies/origins: both approved frontends work; an unapproved Origin fails; old x-session-id bearer values cannot authenticate; cookie is HttpOnly/host-only and Secure in production. Verify preflight and credentials on backup downloads.
- Access: the four approved IDs can administer OFFICE membership and backups; an ordinary OFFICE session gets 403 on direct calls. Ordinary business operations still work. Staff profile edits do not change password hashes; replies contain no password field. Test new OFFICE creation and OFFICE removal/re-addition using the existing shared password, plus IC changes and employee ID changes. This does not prevent impersonation through a known shared credential.
- Backups: malformed names (path separators, traversal, quotes, shell substitutions, control characters and excessive length) fail before file/process operations. Verify local and S3 lists, a legacy dump, a new dump, an S3-only download, failed upload visibility, last-backup deletion protection and >1,000-object listing. Old nested purchase attachments must never be retention candidates.
- Recovery: complete the isolated restore procedure with documents and an older schema dump. Confirm no old session resumes.
- Payroll: save/reprocess an item whose description/pay code includes apostrophes; reject nonnumeric rates; submit a batch with one invalid FK and valid rows on either side. Valid rows must commit and the rejected row must leave no partial payroll.
- Transactions: concurrent catalogue, daily/monthly work log and payroll writes across TH/JP; force a mid-write error and an early validation return; verify rollback and usable subsequent requests. Confirm JP and TH post-commit payroll recalculations still run.
- Deploy topology: Node :5000 and Nginx :80 reachable over loopback for cloudflared; external direct-origin connections blocked; database role cannot create/drop tables, assume an owner role, or read server files.

Session/cookie choices follow [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html); credential throttling and reauthentication follow [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). The transaction repair follows [node-postgres's requirement to use one client](https://node-postgres.com/features/transactions). These are design references, not claims of full ASVS/NIST/ISO compliance.
