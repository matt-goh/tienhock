# Hetzner production server bootstrap

Production uses system Nginx and PM2. The Cloudflare Tunnel sends
`api.tienhock.com` to `http://localhost:80`; system Nginx then proxies to the
PM2-managed Node server at `127.0.0.1:5000`.

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
