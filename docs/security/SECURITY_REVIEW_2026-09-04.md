# Security review — 4 September 2026

**Remediation update:** repository changes for S01-S10 and outstanding production decisions are tracked in [5 September remediation](SECURITY_REMEDIATION_2026-09-05.md). This document preserves the original assessment and line references.

**Assessment: important protections exist, but the project is not ready for a claim of strong security or standards compliance. Two critical injection findings need attention first.** The recommendations below are sized for a small Malaysian business operating an ERP, with account takeover, financial tampering, personal-data disclosure, and recovery as the main concerns.

This is an assessment, not a remediation release. Application code, dependencies, databases, accounts, and production configuration were not changed.

## Scope and evidence

Baseline: commit `671511a0443c14174edccbc2b31ef1a2284843cc`, initially clean working tree.

- Inventoried 871 tracked files. Parsed 729 JavaScript/TypeScript source files without compiling or type-checking them. Identified 883 router declarations in 124 files, 142 application registration calls, 3,786 database query calls, and 290 SQL-like interpolated templates. Declarations are not a count of distinct deployed endpoints; factories and aliases can expand or duplicate them.
- Reviewed shared authentication, all company route mounts, login/session lifecycle, staff management, backup/restore, payroll query construction, accounting integrity guards, uploads/S3, browser storage and HTML sinks, external API clients, deployment, and database configuration. Automated coverage spans the repository; manual examination concentrated on security boundaries and flagged data flows, rather than claiming every business path was exercised.
- Ran `npm audit --json --ignore-scripts` and its `--omit=dev` variant against the lockfile. These contact the package registry with dependency metadata; source code and business records were not submitted to an external scanner. No install, dependency fix, build, lint, or type-check command was run.
- Ran Gitleaks 8.30.1 locally, after checking its downloaded archive against the upstream release checksum. Scanned a 874-file snapshot consisting of tracked files plus the local `.env` and two ignored Compose files, and local Git history with `--all`. Gitleaks reported 2,976 scanned commits; Git has 3,328 reachable commits, including commits that contribute no scanned patch. History absent from this clone, old external clones, and remote caches remain outside coverage.
- Ran aggregate and metadata queries inside an explicit read-only transaction against **the development database only**. No employee identifiers, passwords, session tokens, or customer records are reproduced here.
- Sent six unauthenticated `HEAD` requests to public deployment URLs. Both frontend homepages returned 200. `/api/staffs`, `/api/backup/list`, `/greentarget/api/customers`, and `/jellypolly/api/invoices` on `api.tienhock.com` returned 401. No authenticated production request, exploit payload, write, restore, brute-force attempt, or load test was performed.

Companion files: [scan evidence](SECURITY_SCAN_EVIDENCE_2026-09-04.json), [route declarations](ROUTE_INVENTORY_2026-09-04.csv), and [short interview answers](INTERVIEW_SECURITY_ANSWERS.md).

**Evidence labels:** “confirmed in source” means a traced code path, not successful exploitation of production. “Observed in development” and “observed live” are explicitly distinguished. Cloudflare account settings, firewall rules, S3 policies, deployed versions, production database privileges, account MFA, branch protections, and actual restore reliability were not available for verification.

## Findings and repair order

### S01 — Critical: backup filenames reach shell commands

**Confirmed in source.** An authenticated OFFICE session reaches the backup router without a separate administrator check: [route mount](../../src/routes/index.js#L211). In [backup.js](../../src/routes/admin/backup.js#L1360), `/delete` accepts `filename`, incorporates it into a filesystem path, and sends constructed command strings to `exec` through `executeCommand` at line 362. It also inserts the filename into a shell-based log command. `/restore` at line 1598 has the same unsafe path into a shell existence check. `/download/:filename` at line 1431 rejects slashes, but still permits shell metacharacters.

Double quotes around a shell argument do not neutralize command substitution. Path traversal is also possible in the delete/restore inputs, which do not enforce a backup-directory boundary. A compromised office account could potentially execute commands as the Node process user, delete accessible files outside the backup folder, or interfere with recovery. Root access was not demonstrated or assumed.

**Minimum fix:** restrict these operations to a specific administrator, remove shell-string execution from request-controlled paths, use filesystem APIs and `spawn`/`execFile` argument arrays, pass database passwords through the child environment, and select backups from a validated server-side inventory. Require an exact permitted basename and verify the resolved path stays in the intended backup directory. Restrict restore access immediately while this is repaired.

**Acceptance:** ordinary office accounts receive 403 for administrative backup operations; traversal, unexpected extensions, and shell syntax are rejected before any process/filesystem operation; legitimate create, download, and restore still work in a disposable environment.

### S02 — Critical: payroll writes contain SQL injection paths

**Confirmed in source.** [employee-payrolls.js](../../src/routes/payroll/employee-payrolls.js#L1916) accepts request-supplied payroll items in both `POST /api/employee-payrolls/batch` and the root POST at line 2162. At lines 2059 and 2280, `pay_code_id`, `rate_unit`, numeric-looking fields, and `is_manual` are interpolated directly into SQL tuples. Only the description receives quote escaping. Those queries execute without a parameter array; the required-field checks do not constrain these values sufficiently.

This allows request data to become SQL syntax rather than remaining data. It threatens the entire database reachable by the application's database role, not just the targeted employee's payroll. Two related paths need the same repair: stored payroll-item interpolation in [monthly-payrolls.js](../../src/routes/payroll/monthly-payrolls.js#L1987), and cached session/staff identifiers inserted into restore SQL in [backup.js](../../src/routes/admin/backup.js#L1000). The latter can contain values originally admitted through login or staff creation.

**Minimum fix:** parameterize every value, including bulk inserts; validate item arrays, finite numeric amounts, booleans, identifiers, and allowed rate units. Do not rely on hand-written quote escaping. The existing parameterized bulk insert in `src/routes/payroll/cp8d.js` provides a local example.

**Acceptance:** SQL syntax supplied in every interpolated item field remains inert or gets a validation error; normal payroll saves and recalculations retain correct totals. Check both direct submissions and values loaded back from the database.

### S03 — High: ordinary office accounts have administrative powers

**Confirmed in source.** [auth.js](../../src/middleware/auth.js#L276) verifies an active session, OFFICE membership, and employment status. It does not enforce a separate permission for staff administration, payroll, financial changes, backup downloads, restore, or backup deletion. The route mounts and these handlers do not supply that missing distinction. An office user can also change staff job membership through the staff APIs.

The company prefixes and database schemas separate accounting data structurally, but all three company APIs accept the same office identity without company-specific entitlements. That can be an intentional business policy; it is not an independent tenant security boundary. A user with a valid session should currently be treated as highly privileged.

**Minimum fix:** define a small permission matrix, initially administrator versus ordinary office user, with payroll/finance access separated where the business needs it. Enforce permissions at the API. Protect staff access changes, backup administration, and dangerous financial actions first. If all office users intentionally work across the three companies, record that policy rather than building unnecessary tenant infrastructure. [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) distinguishes knowing a user's identity from permitting an action.

**Acceptance:** use two accounts to verify permissions through direct API requests, including requests to another company's routes. Hiding a button is insufficient.

### S04 — High: a shared default password is assigned and restored during staff edits

**Confirmed in source; supporting development observation.** [staffs.js](../../src/routes/catalogue/staffs.js#L35) defines one default bcrypt hash. Creating an OFFICE staff member assigns it at line 187; editing one assigns it again at line 725. Consequently, an unrelated staff edit can overwrite a separately changed password. Create/update/delete responses return `RETURNING *` results, including the password hash, at lines 259, 789, and 840.

The development database has 12 active office accounts with passwords and only **one distinct password hash**. This aggregate observation does not establish production passwords or demonstrate knowledge of the plaintext. Bcrypt is a good building block, but shared credentials defeat individual account protection.

**Minimum fix:** give every user an individual password; use a one-time setup/reset process; stop changing passwords during ordinary profile edits; omit password hashes from all responses; allow secure password changes and revoke sessions on reset. bcrypt can remain if configured appropriately; replacing it is less urgent than correcting this lifecycle.

**Acceptance:** editing an address or payroll field leaves the password unchanged; account setup and resets produce independent hashes; API responses never contain password fields.

### S05 — High: session tokens are client-selected and not securely generated

**Confirmed in source.** [login](../../src/routes/auth/auth.js#L44) accepts the client's `sessionId` and activates/upserts it without replacing it after authentication. [SessionService.ts](../../src/services/SessionService.ts#L56) constructs IDs using a timestamp and seven base-36 characters derived from `Math.random`; the server fallback also uses `Math.random`. Neither is a cryptographic generator. Accepting a caller-chosen identifier creates session-fixation risk if an attacker can arrange for a victim to use that identifier; this is not, by itself, proof that any arbitrary visitor can impersonate someone.

Tokens persist in localStorage. The [session state URL](../../src/services/SessionService.ts#L174) includes the bearer token, potentially exposing it in proxy/access logs. Middleware uses a rolling seven-day activity window with no visible absolute session lifetime; cleanup may shorten effective lifetime but does not supply secure token generation or rotation. Restore also preserves sessions, undesirable during incident recovery.

**Minimum fix:** issue a fresh server-generated token using a cryptographic random generator on each login; reject client token selection; rotate/revoke on credential changes; remove tokens from URLs; establish an absolute lifetime and a practical idle limit. Prefer a Secure, HttpOnly cookie with suitable SameSite and CSRF/origin protections if migrating transport; the public form and mobile client need separate handling. Do not switch to cookies without addressing CSRF.

**Acceptance:** a submitted token never becomes the authenticated token; old tokens fail after logout/reset; tokens do not appear in URLs or logs. See [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

### S06 — High: login has no visible guessing protection or second factor

**Confirmed application/configuration gap; external controls unknown.** [auth/auth.js](../../src/routes/auth/auth.js#L8) contains no login throttling, backoff, or MFA. Its distinct “not found”, “password not set”, and “incorrect password” responses disclose account state. The tracked live Nginx configuration adds no rate limit. The deployment workflow does not establish Cloudflare Access or MFA.

**Minimum fix:** validate login input types/lengths, use a generic failed-login response, add limits by account and trustworthy client IP, and use progressive backoff. Require MFA for administrative access and infrastructure accounts; extending it to the small office user group is worthwhile. Keep an owner-controlled recovery method. If an access gateway is chosen, protect the API as well as the frontend and preserve the intentional public/mobile workflows.

**Acceptance:** repeated failures are throttled without making permanent account lockout an easy denial-of-service attack; responses do not reveal whether an IC number exists. Confirm actual second-factor enforcement rather than inferring it from the hosting provider.

### S07 — High: historical credentials and the shared mobile key need a rotation plan

**Confirmed source/history exposure; present credential validity unknown.** Gitleaks produced four current-workspace candidates: the `.env` mobile SHA-256 setting is a digest, not the raw credential; three literal credential findings are in the **ignored, alternate** `prod/docker-compose.yml` (tunnel token and two MyInvois secrets). It is not the active PM2 deployment definition and is not currently tracked. Its local contents still require care.

The history scan produced 29 candidates, not 29 proven live leaks. Triage identified 18 report `lineKey` values, two `REMOVED_SECRET` examples, and one placeholder as non-secret findings. The remaining eight findings involve literal credential material in historical source/deployment files; occurrences may repeat the same secret. Current tracked files produced no high-entropy secret finding with these default rules. That is not a guarantee against unrecognized or low-entropy secrets.

[prod/server/README.md](../../prod/server/README.md#L29) separately documents that the mobile API credential appeared in history and its existing value is deliberately retained for compatibility. Storing its SHA-256 digest does not revoke copies of the original key. The current middleware carefully limits its routes, which is valuable, but it grants invoice submission and cancellation without identifying an individual salesperson. [Invoice cancellation](../../src/routes/sales/invoices/invoices.js#L3970) looks up an invoice by ID, without mobile-user ownership checks; business cancellation guards still apply.

**Minimum fix:** inventory and rotate exposed credentials whose revocation cannot be established. Coordinate a mobile release before revoking its shared key; ultimately use revocable per-device/user credentials tied to permitted salespeople and invoices. Keep the current route restriction during that transition. Enable secret scanning for future changes. Do not treat deleting Git history as a replacement for revocation.

**Acceptance:** retired credentials fail, legitimate integrations still work, and a mobile credential cannot act on another salesperson's invoices. No credentials were tested against external services in this audit.

### S08 — High: recovery is not independent of application compromise

**Confirmed design gaps; live S3 policy and restore capability unverified.** Office sessions can list/download/delete backups and initiate destructive restore. [s3-backup.js](../../src/utils/s3-backup.js#L227) uses credentials held by the application to request deletion of backup objects. Whether a particular delete succeeds depends on the actual IAM/retention policy, which was not inspected. A separate backup bucket alone would not solve this if the same compromised identity could still erase it.

[server.js](../../server.js#L149) schedules a new database dump weekly; the daily task syncs existing files rather than producing a fresh dump. That leaves up to roughly a week of changes between scheduled recovery points if there are no other backups. Both backup creation and S3 upload helpers can return `false` without throwing, while the scheduler logs completion. This can conceal unsuccessful backups.

There is a connected document-storage issue: `listS3Backups` lists the whole `${env}/` prefix without pagination or a backup-only filter. Purchase attachments use the same environment prefix. Retention therefore can consider old attachments for deletion, and a database dump alone does not restore their file contents. The production `pg_restore --clean` path restores directly into the live database; the more cautious staged SQL-upload workflow is development-only. A failed live restore can leave partial recovery.

**Minimum fix:** create fresh daily backups, alert on failure or stale last-success time, and keep a recovery copy that the application/normal admin session cannot delete. Separate backup and attachment prefixes and credentials; use a lifecycle policy with deliberate retention. Object Lock or an independently controlled/offline copy can protect recovery; [AWS documents the retention controls](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html). Verify pagination and include uploaded documents in the recovery plan. Practice restoring to a disposable database before relying on it, and revoke sessions during incident recovery.

**Acceptance:** recover a selected backup plus its attachments on a separate environment, verify ledger/payroll totals and freshness, and demonstrate that the application identity cannot destroy protected recovery copies. Agree a business recovery target; daily backups and recovery within one business day are proposed starting points, not promises established by this audit.

### S09 — High: the running app is configured with a database administrator identity

**Confirmed deployment configuration; development role verified.** [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml#L38) sets `DB_USER=postgres`. The development role is a superuser with create-role, create-database, and row-security bypass privileges. Production role flags were not queried. This makes injection and stolen application credentials much more damaging than necessary.

The server [binds to `0.0.0.0:5000`](../../server.js#L212), ignoring the workflow's `HOST=127.0.0.1`. Nginx listens on port 80. A tunnel does not itself close either port on the host. The ignored development Compose file publishes PostgreSQL on all host interfaces. Firewall exposure was not tested, so none of these bindings alone proves Internet reachability.

**Minimum fix:** use a non-superuser runtime database role with only required table/sequence permissions. Move restore/schema administration to a separate privileged operation. Bind the production backend to loopback and restrict origin/SSH/database access with firewall rules. Bind development PostgreSQL to loopback too.

**Acceptance:** the runtime identity cannot create roles/databases or perform unrelated schema changes; normal ERP writes continue; independent network verification confirms the origin and database are not publicly reachable.

### S10 — High: many transactions are started on a pool rather than one connection

**Confirmed in source.** The static inventory found **54** `pool.query("BEGIN")`/equivalent sites. Examples include [login](../../src/routes/auth/auth.js#L46), [employee payroll save](../../src/routes/payroll/employee-payrolls.js#L2183), and several catalogue/work-log handlers. [db-pool.js](../../src/routes/utils/db-pool.js#L40) forwards each call independently to `pg.Pool`; it does not pin a connection for these transactions.

Under concurrency, the intended BEGIN, updates, and COMMIT may execute on different connections. This undermines atomicity and can leave financial writes or session revocations partially applied, or interleave them with another request. Many other services correctly acquire a client, so this is a specific recurring defect rather than an absence of transactions everywhere. [node-postgres explicitly requires one client for a transaction](https://node-postgres.com/features/transactions).

**Minimum fix:** use `pool.connect()`, execute the whole transaction through that client, roll back on failure, and release in `finally`. Prioritize authentication and money-changing paths.

**Acceptance:** in a disposable environment, concurrent saves plus forced failures demonstrate complete rollback, isolation between requests, and no connection leaks.

### S11 — Medium: attribution can be forged and audit history is incomplete

**Confirmed in source.** Some handlers correctly use the authenticated actor. Others accept `created_by` from the request, including [production batch entry](../../src/routes/stock/production-entries.js#L648), [GT driver logs](../../src/routes/greentarget/daily-lori-habuk.js#L220), and payroll creation. A caller can misattribute these operations. Mutable `created_by`/`updated_by` columns and general application logs are not a complete history of previous values, exports, credential changes, or restore activity.

**Minimum fix:** derive actors from authentication everywhere. Add a focused event log for logins, access changes, sensitive exports, accounting cancellation/override, and backup administration. Record actor, timestamp, action, target, and outcome; never passwords/tokens. Retain a copy outside the application's modification rights. A simple protected event stream is sufficient initially.

**Acceptance:** a forged actor in a request is ignored or rejected; critical changes can be traced to the actual authenticated identity and previous business state where appropriate.

### S12 — Medium: bank-ins can bypass the accounting history lock

**Confirmed in source; already documented as deferred in AGENTS.md.** [bank-in-service.js](../../src/routes/accounting/bank-in-service.js#L196) does not apply `assertTienHockAccountingDateUnlocked` in create, drawing, or cancellation. For example, the drawing path at line 489 accepts a date, creates a posted RV journal, and never applies the cutover guard. The development journal trigger inventory contains timestamp-update triggers, not a database period-lock safeguard.

Other current TH manual-journal paths do enforce the lock; the comment in GT's lock helper describing TH manual journals as unguarded is stale. This review does not treat that stale comment as evidence of an additional vulnerability.

**Minimum fix:** apply the existing guard consistently to submitted and existing dates on the affected bank-in lifecycle. Preserve explicitly approved import-only paths outside ordinary HTTP requests.

**Acceptance:** backdated create/drawing/cancel requests before the TH cutoff return 409 with no ledger movement; ordinary open-period bank-ins still work.

### S13 — Medium: public endpoint abuse and resource limits need tightening

**Confirmed in source; edge-level exploitability depends on configuration.** The public [GT signup limiter](../../src/routes/greentarget/customer-signups.js#L35) trusts the first `X-Forwarded-For` value. The tracked Nginx configuration appends to that header. Without an explicitly trusted proxy/edge sanitization boundary, a caller-controlled value can undermine per-client limits. Cloudflare header rewriting was not tested with spoofed requests.

Global [body parsing](../../server.js#L75) permits 50 MB before authentication. Many bulk operations have no item-count bound. MyInvois clients buffer responses and lack visible request deadlines. A 20-connection database pool limits concurrency but is not a request-rate control. Nginx/Cloudflare may impose smaller body limits; their effective global limits were not inspected.

**Minimum fix:** establish a trustworthy client-IP chain, set small route-appropriate limits for login/signup, cap bulk item counts, and add API timeouts. Keep larger limits only where imports/uploads need them. No distributed rate-limit service is required for the current single-process deployment if its limitations are understood.

### S14 — Medium: browser/transport hardening and error privacy are incomplete

**Observed live and confirmed in source.** Both live frontend homepages lacked CSP, HSTS, and an anti-framing policy in the sampled response. They did supply `nosniff` and a reasonable referrer policy. Sampled API 401 responses lacked explicit security/cache headers and exposed `X-Powered-By: Express`. This does not prove a stored XSS vulnerability, but missing anti-framing controls leave logged-in workflows exposed to clickjacking, and absent CSP removes a useful additional barrier.

Authenticated APIs frequently return raw `error.message`; session IDs appear in request paths. General protected responses lack a shared `Cache-Control: private, no-store` policy, although the audit-export handler and frontend GET helper already use cache protections. No cross-user cache leak was demonstrated. [Database TLS](../../src/routes/utils/db-pool.js#L24) uses `rejectUnauthorized: false`; restore connections do likewise. With the documented loopback database this is a lower practical risk, but it must not be copied to an untrusted network.

**Minimum fix:** add anti-framing headers and a measured CSP rollout, enable HSTS after checking the intended domains, apply private/no-store to sensitive responses, and return generic server errors with an internal reference. Verify database certificates if using TLS, or document and secure a local socket/loopback transport. Avoid blanket policies that break PDF iframes, blob previews, or fonts.

### S15 — Medium: uploaded attachments are trusted by extension and declared MIME type

**Confirmed in source.** [self-billed-invoices.js](../../src/routes/accounting/self-billed-invoices.js#L124) sanitizes filenames, limits uploads to 25 MB, checks a type/extension allowlist, retrieves files through an authenticated route, and serves them as attachments. These are useful controls. It does not verify that the actual bytes match the declared format or scan documents for malware; `application/octet-stream` is allowed with a permitted extension.

**Minimum fix:** inspect file signatures, align extensions and content types, keep download disposition/nosniff, and use endpoint/document malware protection for uploaded Office/PDF files. A dedicated scanning pipeline can be deferred if uploads stay restricted to trusted staff and residual risk is accepted. It becomes more important if public uploads are introduced. Protect attachment history alongside database recovery as described in S08.

### S16 — Medium: deployment assurance and sensitive development data need attention

**Confirmed repository gaps; account settings unknown.** The only tracked CI workflow deploys immediately on a production push. It uses an action version tag, trusts `ssh-keyscan` obtained during that same connection setup, uses `npm install` rather than reproducible `npm ci`, and adds no automated security gate. The workflow does not explicitly set restrictive `.env` file permissions. Actual file modes and GitHub branch/account protections were not inspected.

Tracked accounting fixtures and handover documents contain business/customer information; the project also supports restoring real database dumps into development. Current `.gitignore` excludes several private datasets and `.env`, which helps, but does not make the remaining history safe to publish. Repository visibility was not verified. The alternate Dockerfile uses a broad `COPY . .` and no explicit non-root user; this is a dormant-topology concern, not a finding about current PM2 privileges.

**Minimum fix:** verify/pin the server SSH host key through a trusted channel, protect production pushes, enable MFA on infrastructure/GitHub accounts, restrict secret-file permissions, use a reviewed lockfile with `npm ci`, and add lightweight dependency/secret checks. Keep real datasets private and prepare sanitized fixtures for a portfolio. Fix the dormant Docker packaging before using it. A complex delivery platform is unnecessary.

## Dependency results

| Lockfile scope | Critical | High | Moderate | Low | Total affected package records |
| --- | ---: | ---: | ---: | ---: | ---: |
| All dependencies | 3 | 17 | 29 | 5 | 54 |
| Production dependencies | 1 | 7 | 24 | 0 | 32 |

These totals are npm's package-level records, including transitive parents; they are **not distinct exploitable vulnerabilities** and are not added to the 16 application/configuration findings above. The live installed dependency tree was not queried.

Key examples:

- `fast-xml-parser@5.2.5` is pulled through `@aws-sdk/client-s3 -> @aws-sdk/core -> @aws-sdk/xml-builder`. The registry reports critical XML/entity handling risk, including [the upstream advisory](https://github.com/advisories/GHSA-m7jm-9gc2-mpf2). Its presence merits an SDK/transitive update; a reachable attacker-controlled XML parsing path was not demonstrated here.
- `express@4.21.2 -> path-to-regexp@0.1.12` has a high advisory related to particular route patterns. Inspect reachable patterns while updating; package severity alone does not establish a working denial-of-service attack against this app.
- The other critical records, `shell-quote@1.8.2` through `concurrently` and `form-data@4.0.1` through `wait-on -> axios`, occur in development dependencies. Vite, Rollup, and other toolchain alerts belong in that review too. They are not evidence that a static Cloudflare Pages response exposes a development server.
- Lodash, React Router, body-parser/qs, and related packages need review/update. No attacker-controlled Lodash template compilation or React Router SSR deployment was identified. Do not describe those advisory scenarios as confirmed application exploits.

**Action:** update in small, compatible groups, inspect transitive versions, rerun both audits, and manually verify login, payroll, invoices/e-Invoice, PDFs, imports, and backups. Avoid a blind `npm audit fix --force`. Keep an explicit reason and review date for any accepted residual advisory.

## What already helps

- Session authentication protects the business APIs in all three company namespaces. Four representative live protected paths rejected anonymous requests.
- Mobile authentication has strict header parsing, rejects mixed credentials, compares digests with `timingSafeEqual`, and enforces a narrow method/path/query allowlist. Session initialization now checks that the session cannot switch staff identity.
- Password comparison uses bcrypt. Most SQL values use parameter arrays. Critical accounting services often use one acquired client, transactions, row locks, amount checks, and source-ownership/cancellation guards.
- TH/GT history locks and imported-journal restrictions protect many accounting paths. These business rules limit accidental corruption, though they do not replace permissions or protect against arbitrary SQL.
- The reviewed frontend normally uses React-rendered text. The direct `innerHTML` assignment found is a development print-preview message built from shipped translations, not an identified untrusted customer-data XSS sink.
- The reviewed MyInvois clients pin requests to a configured HTTPS hostname. No general user-supplied URL-fetch/proxy endpoint was identified; no confirmed SSRF finding is asserted.
- Production uses HTTPS at Cloudflare, a tunnel, and a tracked Nginx deployment helper with configuration validation/rollback. These are useful operational controls, subject to confirming the actual firewall and account settings.
- Backup code exists. Current AWS S3 uploads receive provider-side encryption by default; absence of an explicit encryption option in `PutObject` is **not** proof that backups are unencrypted. Bucket access, retention, older objects, and recovery independence still require verification. [AWS encryption documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-encryption-faq.html).

## Proportionate plan for this business

| Order | Work | Evidence that it is done |
| --- | --- | --- |
| First | Restrict backup administration; fix shell and SQL injection; preserve an independently controlled recovery copy | Direct requests cannot cross permission boundaries or turn data into commands; recovery copy survives app-identity deletion attempts |
| Next | Individual passwords, secure server-issued sessions, guessing protection, administrator MFA, exposed-secret rotation | Old credentials/tokens fail; users authenticate independently; failed attempts are limited; mobile transition is verified |
| Next | Non-superuser database role, loopback/firewall restrictions, daily backups with alerts and restore exercise | Role/network inspection plus a measured successful recovery of data and attachments |
| Then | Transaction corrections, actor attribution, history-lock gap, dependency updates, browser headers | Financial concurrency/rollback checks, accurate event records, no unreviewed critical dependency exposure |
| Ongoing | Monthly patch review, immediate staff offboarding, periodic restore drills, small incident checklist | Named owner, dated records of updates/recovery, and an exercised revocation/recovery procedure |

A proposed starting recovery objective is at most one day of lost entries and recovery within one business day. Confirm that the office can tolerate this; if re-entering a day's transactions is unacceptable, increase backup frequency or introduce point-in-time recovery. Do not promise either target until measured.

It is reasonable to defer Kubernetes/service meshes, a 24/7 security operations team, enterprise SIEM, custom identity infrastructure, active-active regions, mandatory row-level security for intentionally shared office access, and paid certification projects. None repairs the concrete flaws above. Simple controls maintained consistently have more value for this ERP.

## Standards and assurance

[OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) is a useful application-security requirements reference. Use relevant requirements to build a practical baseline; Level 2 can be a longer-term target for an application holding payroll and financial information. This review is **not** a requirement-by-requirement ASVS verification and does not award an ASVS level. Injection, authentication, session, and authorization gaps already prevent a credible broad conformance claim.

[NIST's CSF 2.0 small-business guidance](https://www.nist.gov/itl/smallbusinesscyber/nist-cybersecurity-framework-0) is a better fit for operating this system than copying a large corporation's tooling. [NIST SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final) provides a development-process reference; the consulted SSDF 1.2 page is an initial public draft, not a basis for claiming final compliance.

| Area assessed | Current conclusion |
| --- | --- |
| Authentication/session identity | Partial; important lifecycle and credential defects |
| Permissions/company boundaries | Office authentication exists; fine-grained administrative limits absent |
| SQL/OS injection | Critical failures confirmed in source |
| Browser/API security | Useful defaults; headers, error privacy, limits need work |
| File handling | Auth, size/type restrictions present; byte/malware checks incomplete |
| Financial integrity | Many guards present; transaction and bank-in gaps remain |
| Secrets/dependencies | Historical exposure and unresolved advisories require action |
| Recovery/detection | Code exists; independent survival, alerts, restore results unverified |
| Hosting/account configuration | Partly inspectable from files/public headers; live account/firewall/IAM review outstanding |
| Formal certification/legal compliance | Not established by this assessment |

SOC 2 assurance and ISO 27001 certification involve organizational scope, operations, and evidence beyond source code. There is no universal “Big Tech/Fortune 500 compliant project” status that guarantees a hiring outcome. In interviews, explain your threat model, controls, verification, and remaining tradeoffs.

For the Malaysian business, personal-data handling deserves a separate applicability review, including employee records, financial exports, retention, and development copies. The regulator's [Personal Data Protection Standard](https://www.pdp.gov.my/ppdpv1/en/personal-data-protection-standard-2015/) addresses security, retention, and accuracy. No conclusion about full PDPA compliance, notification duties, or exemptions is made here.

## Verification still required before stronger claims

In a disposable environment with fabricated data, verify anonymous denial, office/admin separation, mobile ownership, token rotation/revocation, inert injection inputs, and financial rollback under concurrency. Then verify the actual production runtime role, firewall, provider MFA, S3 access/retention, dependency versions, and successful restoration of both database and documents.

No exploit execution, automated application test suite, full penetration test, availability assessment, or production incident investigation was performed. The review does not establish that an attack has occurred. It establishes concrete issues to repair and the evidence needed before claiming they are resolved.
