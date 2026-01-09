# Migration Plan: AWS to Hetzner CPX12 (Without Docker)

**Created:** January 9, 2026
**Status:** Pending - awaiting Hetzner account verification

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

## Phase 1: Hetzner VPS Setup

### 1.1 Create Server
1. Log in to Hetzner Cloud Console
2. Create new server:
   - Location: **Singapore**
   - Image: **Ubuntu 24.04**
   - Type: **CPX12** (1 vCPU, 2GB RAM, 40GB NVMe)
   - Add SSH key for secure access
   - Enable **IPv4** ($0.60/month extra)

### 1.2 Initial Server Configuration
```bash
# SSH into server
ssh root@<hetzner-ip>

# Update system
apt update && apt upgrade -y

# Set timezone
timedatectl set-timezone Asia/Kuala_Lumpur

# Create non-root user
adduser tienhock
usermod -aG sudo tienhock

# Set up SSH for new user
mkdir -p /home/tienhock/.ssh
cp ~/.ssh/authorized_keys /home/tienhock/.ssh/
chown -R tienhock:tienhock /home/tienhock/.ssh

# Disable root SSH login (edit /etc/ssh/sshd_config)
# PermitRootLogin no
systemctl restart sshd
```

### 1.3 Firewall Setup (UFW)
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # HTTP (for Let's Encrypt)
ufw allow 443/tcp   # HTTPS (if needed)
# Note: Cloudflare tunnel doesn't need open ports
ufw enable
```

---

## Phase 2: Install Dependencies

### 2.1 PostgreSQL 16
```bash
# Add PostgreSQL repo
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt update

# Install PostgreSQL 16
apt install postgresql-16 -y

# Start and enable
systemctl start postgresql
systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<EOF
CREATE USER tienhock WITH PASSWORD 'your_secure_password_here';
CREATE DATABASE tienhock_prod OWNER tienhock;
GRANT ALL PRIVILEGES ON DATABASE tienhock_prod TO tienhock;
EOF
```

### 2.2 Node.js 20 LTS
```bash
# Install Node.js via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install nodejs -y

# Verify
node -v  # Should show v20.x.x

# Install PM2 globally
npm install -g pm2
```

### 2.3 Nginx
```bash
apt install nginx -y
systemctl start nginx
systemctl enable nginx
```

### 2.4 Cloudflared
```bash
# Download and install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
dpkg -i cloudflared.deb

# Install as service (will configure later)
```

---

## Phase 3: Database Migration

### 3.1 Export from RDS
```bash
# On your local machine or EC2
pg_dump -h tienhockdb.cfsoo4y6e4d4.ap-southeast-1.rds.amazonaws.com \
  -U tienhock -d tienhock_prod -F c -f tienhock_backup.dump
```

### 3.2 Transfer to Hetzner
```bash
scp tienhock_backup.dump tienhock@<hetzner-ip>:/home/tienhock/
```

### 3.3 Import to Hetzner PostgreSQL
```bash
# On Hetzner server
sudo -u postgres pg_restore -d tienhock_prod /home/tienhock/tienhock_backup.dump

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

### 4.3 Create PM2 Ecosystem File
Create `ecosystem.config.cjs` in project root:

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
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: 5000,

      // Database (now localhost on Hetzner)
      DB_USER: 'tienhock',
      DB_HOST: 'localhost',
      DB_NAME: 'tienhock_prod',
      DB_PASSWORD: '<YOUR_DB_PASSWORD>',
      DB_PORT: 5432,

      // MyInvois API - Tien Hock
      REACT_APP_API_BASE_URL: 'https://api.tienhock.com',
      MYINVOIS_API_BASE_URL: 'https://api.myinvois.hasil.gov.my',
      MYINVOIS_CLIENT_ID: '<YOUR_MYINVOIS_CLIENT_ID>',
      MYINVOIS_CLIENT_SECRET: '<YOUR_MYINVOIS_CLIENT_SECRET>',

      // MyInvois API - Green Target
      MYINVOIS_GT_CLIENT_ID: '<YOUR_MYINVOIS_GT_CLIENT_ID>',
      MYINVOIS_GT_CLIENT_SECRET: '<YOUR_MYINVOIS_GT_CLIENT_SECRET>',

      // MyInvois API - Jelly Polly
      MYINVOIS_JP_CLIENT_ID: '<YOUR_MYINVOIS_JP_CLIENT_ID>',
      MYINVOIS_JP_CLIENT_SECRET: '<YOUR_MYINVOIS_JP_CLIENT_SECRET>',

      // AWS S3 (for backups - keep using AWS S3)
      AWS_ACCESS_KEY_ID: '<YOUR_AWS_ACCESS_KEY_ID>',
      AWS_SECRET_ACCESS_KEY: '<YOUR_AWS_SECRET_ACCESS_KEY>',
      AWS_REGION: 'ap-southeast-1',
      S3_BUCKET_NAME: 'tienhock-prod-bucket'
    }
  }]
};
```

**Note:** Replace all `<YOUR_...>` placeholders with actual values from your current `docker-compose.yml`. Add `ecosystem.config.cjs` to `.gitignore` to avoid committing secrets.

### 4.4 Start Application with PM2
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
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization,x-session-id,api-key' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
    }

    # Handle CORS preflight requests
    location = / {
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' 'https://tienhock.com' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
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

## Phase 7: S3 Backup Configuration

The S3 backup should work as-is since it uses AWS SDK with credentials from environment variables. The `ecosystem.config.cjs` already includes the AWS credentials.

Verify backup works:
```bash
# Trigger a manual backup test
pm2 logs tienhock-server  # Check for backup-related logs
```

---

## Phase 8: Testing & Cutover

### 8.1 Pre-Cutover Testing
1. Test database connectivity:
   ```bash
   sudo -u postgres psql -d tienhock_prod -c "SELECT COUNT(*) FROM invoices;"
   ```

2. Test application locally:
   ```bash
   curl http://localhost:5000/api/health  # Or any test endpoint
   ```

3. Test through Cloudflare tunnel (if using separate test domain)

### 8.2 Cutover Steps
1. **Set maintenance mode** on current production (if available)
2. **Final database sync**: Export fresh backup from RDS, import to Hetzner
3. **Update Cloudflare tunnel** to point to Hetzner server
4. **Test all critical functions**:
   - User login
   - View invoices
   - Create new invoice
   - Payroll operations
   - S3 backup trigger

### 8.3 Post-Cutover
1. Monitor logs: `pm2 logs tienhock-server`
2. Monitor resources: `htop`
3. Keep AWS running for 1 week as fallback
4. After confirming stability, terminate AWS resources

---

## Phase 9: AWS Cleanup (After Stability Confirmed)

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

## Files to Create/Modify

| File | Location | Action | Purpose |
|------|----------|--------|---------|
| `ecosystem.config.cjs` | Hetzner: `/home/tienhock/tienhock-app/` | Create | PM2 config with env vars |
| `tienhock-api` | Hetzner: `/etc/nginx/sites-available/` | Create | Nginx reverse proxy |
| `.gitignore` | Project root | Update | Add `ecosystem.config.cjs` |
| Cloudflare Dashboard | Web | Configure | New tunnel to Hetzner |

**No changes to existing application code required** - only infrastructure/config files.

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
