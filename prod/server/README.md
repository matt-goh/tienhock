# Hetzner production server bootstrap

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
