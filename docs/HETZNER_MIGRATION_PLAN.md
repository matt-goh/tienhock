# Migration Plan: AWS to Hetzner CPX12 (Without Docker)

**Created:** January 9, 2026
**Status:** In Progress - Server ready, awaiting database migration

## Server Details
- **Name:** tienhock-erp
- **IP:** 5.223.55.190
- **SSH:** `ssh root@5.223.55.190` or `ssh tienhock@5.223.55.190`

## Overview

Migrate Tien Hock ERP from AWS (EC2 + RDS) to a single Hetzner VPS, dropping Docker for native services.

| Aspect | Current (AWS) | Target (Hetzner) |
|--------|---------------|------------------|
| Compute | EC2 t2.micro | Hetzner CPX12 (1 vCPU, 2GB RAM, 40GB NVMe) |
| Database | RDS PostgreSQL | Native PostgreSQL 16 |
| App Server | Docker + Node.js | PM2 + Node.js |
| Reverse Proxy | Docker + Nginx | Native Nginx |
| Tunnel | Docker + Cloudflared | Native Cloudflared |
| Backups | S3 | S3 (unchanged) |
| **Monthly Cost** | **~$40** | **~$8.19** |

---

## ✅ Phase 1: Hetzner VPS Setup (COMPLETED)

- Server created: **tienhock-erp** (CPX12, Singapore, Ubuntu 24.04)
- System updated and timezone set to Asia/Kuala_Lumpur
- Non-root user `tienhock` created with sudo privileges
- Hetzner Cloud Firewall configured (TCP 22, TCP 80, ICMP)

---

## ✅ Phase 2: Install Dependencies (COMPLETED)

Installed on server:
- PostgreSQL 16
- Node.js 20 LTS
- PM2
- Nginx
- Cloudflared

---

## Phase 3: Database Migration (NEXT)

### 3.1 Create Database User (on Hetzner server)
```bash
sudo -u postgres psql <<EOF
CREATE USER tienhock WITH PASSWORD 'your_secure_password_here';
CREATE DATABASE tienhock_prod OWNER tienhock;
GRANT ALL PRIVILEGES ON DATABASE tienhock_prod TO tienhock;
EOF
```

### 3.2 Download SQL Backup
Download the SQL backup file from the production app's backup feature.

### 3.3 Transfer to Hetzner (from Windows)
```bash
scp C:\Users\matia\tienhock_backup.sql root@5.223.55.190:/root/
```

### 3.4 Import to Hetzner PostgreSQL
```bash
sudo -u postgres psql -d tienhock_prod < /root/tienhock_backup.sql

# Verify
sudo -u postgres psql -d tienhock_prod -c "\dt"
```

---

## Phase 4: Application Deployment

### 4.1 Clone Application from Git
```bash
cd /home/tienhock
git clone <your-repo-url> tienhock-app
cd tienhock-app
```

### 4.2 Install Dependencies
```bash
cd /home/tienhock/tienhock-app
npm install --legacy-peer-deps
npm run build  # Build frontend
```

### 4.3 Environment File
The `.env` file will be created/updated by GitHub Actions during deployment.

- **From GitHub Secrets**: `DB_PASSWORD`, `MYINVOIS_CLIENT_ID`, `MYINVOIS_CLIENT_SECRET`, `AWS_*`
- **Hardcoded in workflow** (same as docker-compose): `MYINVOIS_GT_*`, `MYINVOIS_JP_*`

### 4.4 Create PM2 Ecosystem File
Create `ecosystem.config.cjs` in project root (no secrets needed - they're in .env):

```javascript
// ecosystem.config.cjs - PM2 configuration for production
module.exports = {
  apps: [{
    name: 'tienhock-server',
    script: 'server.js',
    cwd: '/home/tienhock/tienhock-app',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
    // No env section needed - app loads from .env file
  }]
};
```

### 4.5 Start Application with PM2
```bash
cd /home/tienhock/tienhock-app
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Follow instructions to enable auto-start on boot
```

---

## Phase 5: Nginx Configuration

Create `/etc/nginx/sites-available/tienhock-api`:

```nginx
# API server configuration for api.tienhock.com
upstream backend {
    server 127.0.0.1:5000;
    keepalive 32;
}

server {
    listen 80;
    server_name api.tienhock.com;

    # Global proxy settings
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    proxy_send_timeout 300s;

    # API endpoints
    location / {
        # Clear any existing CORS headers from backend
        proxy_hide_header 'Access-Control-Allow-Origin';
        proxy_hide_header 'Access-Control-Allow-Methods';
        proxy_hide_header 'Access-Control-Allow-Headers';
        proxy_hide_header 'Access-Control-Allow-Credentials';

        proxy_pass http://backend/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS headers
        add_header 'Access-Control-Allow-Origin' 'https://tienhock.com' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE, PATCH' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization,x-session-id,api-key' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
    }

    # Handle CORS preflight requests
    location = / {
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' 'https://tienhock.com' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE, PATCH' always;
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization,x-session-id,api-key' always;
            add_header 'Access-Control-Allow-Credentials' 'true' always;
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain charset=UTF-8';
            add_header 'Content-Length' 0;
            return 204;
        }
        proxy_pass http://backend/;
    }

    # Error handling
    error_page 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/tienhock-api /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # Remove default site
nginx -t  # Test configuration
systemctl reload nginx
```

**Note:** This is an API-only server. The frontend (tienhock.com) is served separately (Cloudflare Pages or similar).

---

## Phase 6: Cloudflare Tunnel Setup

### 6.1 Create New Tunnel (Recommended)
1. Go to Cloudflare Zero Trust Dashboard
2. Access → Tunnels → Create a tunnel
3. Name: `tienhock-hetzner`
4. Copy the tunnel token

### 6.2 Install Tunnel as Service
```bash
# Install with your tunnel token
cloudflared service install <YOUR_TUNNEL_TOKEN>

# Start service
systemctl start cloudflared
systemctl enable cloudflared
```

### 6.3 Configure Tunnel Route
In Cloudflare Dashboard, add public hostname:
- Subdomain: `api` (or your domain)
- Domain: `tienhock.com`
- Service: `http://localhost:80`

---

## Phase 7: Update GitHub Actions CI/CD

### 7.1 Update GitHub Secrets
Go to GitHub repo → Settings → Secrets and variables → Actions

| Secret | Action |
|--------|--------|
| `HETZNER_HOST` | **Add** - `5.223.55.190` |
| `HETZNER_USERNAME` | **Add** - `tienhock` |
| `SSH_PRIVATE_KEY` | Update to your SSH private key (run `cat ~/.ssh/id_ed25519` on Windows) |

Keep `EC2_HOST` and `EC2_USERNAME` for rollback. Other secrets - keep as-is.

### 7.2 Update deploy.yml
Replace `.github/workflows/deploy.yml` with PM2-based deployment:

```yaml
name: Deploy to Hetzner

on:
  push:
    branches:
      - production
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Set up SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H ${{ secrets.HETZNER_HOST }} >> ~/.ssh/known_hosts

      - name: Create env file
        run: |
          cat > /tmp/.env << 'ENVFILE'
          NODE_ENV=production
          HOST=127.0.0.1
          PORT=5000
          DB_USER=tienhock
          DB_HOST=localhost
          DB_NAME=tienhock_prod
          DB_PASSWORD=${{ secrets.DB_PASSWORD }}
          DB_PORT=5432
          REACT_APP_API_BASE_URL=https://api.tienhock.com
          MYINVOIS_API_BASE_URL=https://api.myinvois.hasil.gov.my
          MYINVOIS_CLIENT_ID=${{ secrets.MYINVOIS_CLIENT_ID }}
          MYINVOIS_CLIENT_SECRET=${{ secrets.MYINVOIS_CLIENT_SECRET }}
          MYINVOIS_GT_CLIENT_ID=0233a712-c010-4b4f-afba-9c266076ab50
          MYINVOIS_GT_CLIENT_SECRET=59f50d71-0b60-42c7-a371-0708fc08c27d
          MYINVOIS_JP_CLIENT_ID=12bc3955-80f4-4478-a90e-dec05c771824
          MYINVOIS_JP_CLIENT_SECRET=9106918b-62ec-411a-adc9-34f8990f3f48
          AWS_ACCESS_KEY_ID=${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY=${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION=${{ secrets.AWS_REGION }}
          S3_BUCKET_NAME=${{ secrets.S3_BUCKET_NAME }}
          ENVFILE

      - name: Deploy to Hetzner
        run: |
          # Copy env file to server
          scp -i ~/.ssh/deploy_key /tmp/.env ${{ secrets.HETZNER_USERNAME }}@${{ secrets.HETZNER_HOST }}:~/tienhock-app/.env

          ssh -i ~/.ssh/deploy_key ${{ secrets.HETZNER_USERNAME }}@${{ secrets.HETZNER_HOST }} << 'EOF'
            cd ~/tienhock-app

            # Pull latest changes
            git checkout production
            git pull origin production

            # Install dependencies
            npm install --legacy-peer-deps

            # Build frontend
            npm run build

            # Restart application
            pm2 restart tienhock-server

            # Show status
            pm2 status
          EOF
```

---

## Phase 8: S3 Backup Verification

The S3 backup should work as-is since it uses AWS SDK with credentials from environment variables. The `ecosystem.config.cjs` already includes the AWS credentials.

Verify backup works:
```bash
# Trigger a manual backup test
pm2 logs tienhock-server  # Check for backup-related logs
```

---

## Phase 9: Testing & Cutover

### 9.1 Pre-Cutover Testing
1. Test database connectivity:
   ```bash
   sudo -u postgres psql -d tienhock_prod -c "SELECT COUNT(*) FROM invoices;"
   ```

2. Test application locally:
   ```bash
   curl http://localhost:5000/api/health  # Or any test endpoint
   ```

3. Test through Cloudflare tunnel (if using separate test domain)

### 9.2 Cutover Steps
1. **Set maintenance mode** on current production (if available)
2. **Final database sync**: Export fresh backup from RDS, import to Hetzner
3. **Update Cloudflare tunnel** to point to Hetzner server
4. **Test all critical functions**:
   - User login
   - View invoices
   - Create new invoice
   - Payroll operations
   - S3 backup trigger

### 9.3 Post-Cutover
1. Monitor logs: `pm2 logs tienhock-server`
2. Monitor resources: `htop`
3. Keep AWS running for 1 week as fallback
4. After confirming stability, terminate AWS resources

---

## Phase 10: AWS Cleanup (After Stability Confirmed)

1. **Stop RDS instance** (can snapshot first for safety)
2. **Terminate EC2 instance**
3. **Delete unused EBS volumes**
4. **Release Elastic IP** (if any)
5. **Keep S3 bucket** for backups

---

## Rollback Plan

If migration fails:
1. Update Cloudflare tunnel to point back to EC2
2. Ensure RDS is still running
3. All traffic returns to AWS immediately

---

## Cost Summary

| Service | Before | After |
|---------|--------|-------|
| EC2 | ~$13/month | $0 |
| RDS | ~$23/month | $0 |
| VPC IPv4 | ~$4/month | $0 |
| Hetzner CPX12 | $0 | $7.59 |
| Hetzner IPv4 | $0 | $0.60 |
| S3 (backups) | ~$1-2 | ~$1-2 |
| **Total** | **~$40/month** | **~$9-10/month** |

**Annual savings: ~$360**

---

## Quick Reference Commands

### PM2 Commands
```bash
pm2 start ecosystem.config.cjs  # Start app
pm2 restart tienhock-server     # Restart app
pm2 stop tienhock-server        # Stop app
pm2 logs tienhock-server        # View logs
pm2 monit                       # Real-time monitoring
```

### Service Status
```bash
systemctl status postgresql     # Check PostgreSQL
systemctl status nginx          # Check Nginx
systemctl status cloudflared    # Check Cloudflare tunnel
```

### Database Access
```bash
sudo -u postgres psql -d tienhock_prod  # Connect to database
```
