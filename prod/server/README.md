# Hetzner production server bootstrap

The restricted runtime database role and GitHub Actions secret `ERP_DB_PASSWORD` are in use; see the [deployment readiness record](../../docs/security/DEPLOYMENT_READINESS_2026-09-06.md). Existing shared OFFICE passwords remain by owner decision; no password migration or reset is required. Production restoration from the app is supported through the dedicated helper below, restricted to the four security administrators.

Production uses system Nginx and PM2. The Cloudflare Tunnel sends
`api.tienhock.com` to `http://localhost:80`; system Nginx then proxies to the
PM2-managed Node server at `127.0.0.1:5000`.

## Salesman mobile API credential

The existing mobile app continues sending its current key in the `api-key`
header. Production stores only that key's SHA-256 digest in the
`MOBILE_API_KEY_SHA256` GitHub Actions secret; the raw value must not be
added to source or the server environment. The deploy workflow stops before
changing the server when the digest is missing or malformed.

Configure the digest of the existing app key from a trusted shell:

```bash
read -rsp "Existing mobile API key: " salesman_mobile_key
echo
salesman_mobile_key_hash="$(
  printf '%s' "$salesman_mobile_key" | sha256sum | cut -d ' ' -f 1
)"
gh secret set MOBILE_API_KEY_SHA256 --body "$salesman_mobile_key_hash"
unset salesman_mobile_key salesman_mobile_key_hash
```

Do not generate a replacement unless the installed mobile app can also be
updated. Using the existing digest keeps those installations compatible.
Because the raw key appeared in repository history, this is a constrained
compatibility mode rather than a complete credential rotation.

The credential is restricted to the documented Tien Hock mobile invoice
endpoints. It cannot authenticate Green Target, Jelly Polly, payroll,
accounting, backup, or other ERP routes.

The alternate `prod/docker-compose.yml` topology also requires
`MOBILE_API_KEY_SHA256` in the shell or Compose environment before startup.
It does not read the GitHub Actions secret.

## Production Restore button setup

The Restore button uses the root-owned `/usr/local/sbin/restore-tienhock-backup`
helper. The Node process keeps its ordinary `tienhock_app` credentials. Only
MILTI, TIMOTHY.G, HELEN and MATTHEW can start a restore through the API.
The separate `tienhock_restore` OS account has no interactive shell; its matching
PostgreSQL role uses local peer authentication and has no password, superuser,
database-creation, role-creation or role-membership privileges.

One-time installation on the current Ubuntu/PostgreSQL host, as a server operator:

```bash
cd /home/tienhock/tienhock-app
sudo useradd --system --no-create-home --shell /usr/sbin/nologin tienhock_restore
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d tienhock_prod < prod/server/setup-restore-role.sql
sudo install -o root -g root -m 0755 prod/server/restore-tienhock-backup.py /usr/local/sbin/restore-tienhock-backup
sudo visudo -cf prod/server/tienhock-restore.sudoers
sudo install -o root -g root -m 0440 prod/server/tienhock-restore.sudoers /etc/sudoers.d/tienhock-restore
sudo -n /usr/local/sbin/restore-tienhock-backup --check
```

Skip `useradd` when that dedicated account already exists. Peer authentication
must be enabled for this OS/database user in the local PostgreSQL configuration;
the current Hetzner server supports it. The helper's CLI accepts one validated
backup filename or `--check`, never a database name, path, command or credential.
Do not point sudo at the app-writable repository copy. Subsequent helper-code
changes require an operator to reinstall the reviewed root-owned copy, just like
the Nginx deployment helper; ordinary Git deployment does not replace it.

The helper copies the selected local/S3-downloaded custom-format archive into a
private job directory, rejects symlinks and path traversal, and first creates a
root-only recovery dump under `/var/lib/tienhock-restore/before-restore-*.dump`.
It then assigns only application-schema objects to `tienhock_restore`. The
database itself remains postgres-owned. Restore SQL runs as that limited owner,
and restoration, session deletion and runtime grants commit in one transaction.
Old backups containing sessions do not revive those sessions. The app displays
maintenance progress and reloads afterward; everyone signs in again.

The helper supports this project's PostgreSQL custom-format `.gz` backups, up
to 2 GiB, from the existing backup list. Uploaded plaintext SQL replacement stays
development-only, as before. Restore only this company's trusted backups:
archives contain executable database definitions. A very old schema or a dump
containing privileged routines can fail and roll back. Concurrent/in-flight
database work may delay the transaction; use the existing confirmation to ensure
staff have saved their work. If a process/server interruption leaves the outcome
uncertain, verify the database before resuming work; the existing UI reports that
uncertainty rather than claiming success.

Recovery copies are deliberately outside app-managed retention. An operator must
monitor disk space, keep any needed independent copy and remove obsolete recovery
dumps after verifying the result. These copies are not off-server immutable
storage. Detailed failures are kept privately in
`/var/lib/tienhock-restore/last-error.log`; they can contain database data.

## One-time Nginx deployment bootstrap

Run these commands from `/home/tienhock/tienhock-app` on the Hetzner server:

```bash
sudo visudo -cf prod/server/tienhock-nginx.sudoers
sudo install -o root -g root -m 0755 \
  prod/server/deploy-tienhock-nginx \
  /usr/local/sbin/deploy-tienhock-nginx
sudo install -o root -g root -m 0440 \
  prod/server/tienhock-nginx.sudoers \
  /etc/sudoers.d/tienhock-nginx
sudo visudo -cf /etc/sudoers.d/tienhock-nginx
sudo -n /usr/local/sbin/deploy-tienhock-nginx
```

The first production deployment containing this integration will pull these
files and then stop with a missing-helper message. After that expected first
failure, SSH into the server, run the bootstrap commands above, and re-run the
failed GitHub Actions workflow.

The helper is copied to a root-owned path deliberately. The deployment workflow
may invoke that exact command without a password, but it cannot run arbitrary
commands through `sudo`.

After this bootstrap, `.github/workflows/deploy.yml` installs and reloads the
Git-tracked `prod/nginx/tienhock-api.conf` on every production deployment. The
helper validates the new configuration with `nginx -t` and restores the previous
configuration if validation or reload fails.

Changes to `prod/server/deploy-tienhock-nginx` or its sudoers rule do not update
the root-owned copies automatically. Re-run the relevant validation and install
commands above when intentionally changing that security boundary.

After Nginx deployment or permission maintenance, verify a request larger than
the body buffer as well as a small GET. On this server the worker is `www-data`
and its request-body directory is `/var/lib/nginx/body` (`www-data:root`, mode
`0700`). `sudo -u www-data test -w /var/lib/nginx/body` checks worker write access;
an unauthenticated 64 KiB JSON POST to `/api/daily-work-logs` should reach the app
and return JSON HTTP 401. A failed temporary-file write can instead produce an
HTML HTTP 500 for larger Mee/Bihun saves while smaller Boiler saves still work.
Do not widen the directory to world-writable permissions. See the
[7 September HR save verification](../../docs/security/DEPLOYMENT_READINESS_2026-09-06.md#hr-save-verification).
