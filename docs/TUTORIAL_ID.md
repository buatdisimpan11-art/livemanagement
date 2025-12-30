# Tutorial LiveSync - Self-Hosted dengan PostgreSQL

## Daftar Isi

1. [Persiapan](#1-persiapan)
2. [Instalasi dengan Docker (Recommended)](#2-instalasi-dengan-docker)
3. [Instalasi Manual](#3-instalasi-manual)
4. [Konfigurasi](#4-konfigurasi)
5. [Penggunaan Aplikasi](#5-penggunaan-aplikasi)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Persiapan

### Kebutuhan Sistem

| Komponen | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1 Core | 2+ Core |
| RAM | 2 GB | 4+ GB |
| Storage | 10 GB | 20+ GB |
| OS | Ubuntu 20.04+ / Debian 11+ | Ubuntu 22.04 LTS |

### Software yang Dibutuhkan

**Untuk Docker Installation:**
- Docker 20.10+
- Docker Compose 2.0+
- Git

**Untuk Manual Installation:**
- Node.js 20+
- PostgreSQL 15+
- Nginx (untuk production)
- PM2 (untuk process management)

### Instalasi Docker (Ubuntu/Debian)

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Tambah user ke group docker (logout/login setelah ini)
sudo usermod -aG docker $USER

# Verifikasi instalasi
docker --version
docker compose version
```

---

## 2. Instalasi dengan Docker

### Step 1: Clone Repository

```bash
# Clone project
git clone <your-repo-url> livesync
cd livesync
```

### Step 2: Konfigurasi Environment

```bash
# Buat file .env dari template
cat > .env << 'EOF'
# JWT Secret - WAJIB DIGANTI!
JWT_SECRET=ganti-dengan-secret-minimal-32-karakter-random

# Database (tidak perlu diubah jika pakai docker-compose)
DATABASE_URL=postgres://livesync:livesync_secret_password@postgres:5432/livesync

# Frontend URL (ganti dengan domain Anda)
FRONTEND_URL=http://localhost
VITE_API_URL=http://localhost:3001
EOF

# Buat .env untuk backend
cp backend/.env.example backend/.env
```

**⚠️ PENTING: Ganti JWT_SECRET dengan string random minimal 32 karakter!**

Generate JWT Secret:
```bash
openssl rand -base64 32
```

### Step 3: Build dan Jalankan

```bash
# Build semua container
docker compose build

# Jalankan semua service
docker compose up -d

# Cek status
docker compose ps
```

Output yang diharapkan:
```
NAME              STATUS    PORTS
livesync-api      running   0.0.0.0:3001->3001/tcp
livesync-db       running   0.0.0.0:5432->5432/tcp
livesync-web      running   0.0.0.0:80->80/tcp
```

### Step 4: Verifikasi Instalasi

```bash
# Cek health API
curl http://localhost:3001/health

# Output: {"status":"ok","timestamp":"2024-..."}
```

### Step 5: Buat Password Admin

Database sudah include user admin default, tapi passwordnya perlu di-set:

```bash
# Generate bcrypt hash untuk password Anda
# Gunakan online tool: https://bcrypt-generator.com/
# Atau jalankan script ini:

docker exec -it livesync-api node -e "
const bcrypt = require('bcryptjs');
const password = 'admin123'; // Ganti dengan password Anda
const hash = bcrypt.hashSync(password, 10);
console.log('Password hash:', hash);
"

# Update password di database
docker exec -it livesync-db psql -U livesync -d livesync -c "
UPDATE users SET password_hash = '\$2b\$10\$YOUR_HASH_HERE' 
WHERE email = 'admin@livesync.local';
"
```

### Step 6: Akses Aplikasi

- **Frontend**: http://localhost (atau domain Anda)
- **API**: http://localhost:3001/health
- **Login Admin**:
  - Email: `admin@livesync.local`
  - Password: (sesuai yang Anda set di Step 5)

---

## 3. Instalasi Manual

### Step 1: Install PostgreSQL

```bash
# Install PostgreSQL
sudo apt install postgresql-15 postgresql-contrib-15 -y

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Buat user dan database
sudo -u postgres psql << 'EOF'
CREATE USER livesync WITH PASSWORD 'your_secure_password';
CREATE DATABASE livesync OWNER livesync;
GRANT ALL PRIVILEGES ON DATABASE livesync TO livesync;
\q
EOF

# Import schema
psql -U livesync -d livesync -h localhost -f database/init.sql
```

### Step 2: Install Node.js

```bash
# Install Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# Verifikasi
node --version  # v20.x.x
npm --version
```

### Step 3: Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Konfigurasi environment
cat > .env << 'EOF'
DATABASE_URL=postgres://livesync:your_secure_password@localhost:5432/livesync
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
PORT=3001
FRONTEND_URL=http://localhost:5173
EOF

# Build TypeScript
npm run build

# Test jalankan
npm start
# Ctrl+C untuk stop
```

### Step 4: Setup PM2 (Process Manager)

```bash
# Install PM2 global
sudo npm install -g pm2

# Start backend dengan PM2
cd backend
pm2 start dist/index.js --name livesync-api

# Auto-start on boot
pm2 startup
pm2 save

# Cek status
pm2 status
pm2 logs livesync-api
```

### Step 5: Build Frontend

```bash
cd .. # kembali ke root project

# Install dependencies
npm install

# Konfigurasi environment
echo "VITE_API_URL=http://localhost:3001" > .env

# Build production
npm run build

# Output di folder 'dist/'
```

### Step 6: Setup Nginx

```bash
# Install Nginx
sudo apt install nginx -y

# Buat konfigurasi site
sudo cat > /etc/nginx/sites-available/livesync << 'EOF'
server {
    listen 80;
    server_name localhost;  # Ganti dengan domain Anda
    root /var/www/livesync;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # Frontend - SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Copy frontend build ke web root
sudo mkdir -p /var/www/livesync
sudo cp -r dist/* /var/www/livesync/

# Enable site
sudo ln -sf /etc/nginx/sites-available/livesync /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test dan restart Nginx
sudo nginx -t
sudo systemctl restart nginx
```

---

## 4. Konfigurasi

### Environment Variables

| Variable | Deskripsi | Contoh |
|----------|-----------|--------|
| `DATABASE_URL` | Connection string PostgreSQL | `postgres://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret key untuk JWT token | Random string 32+ chars |
| `PORT` | Port backend API | `3001` |
| `FRONTEND_URL` | URL frontend (untuk CORS) | `https://app.domain.com` |
| `VITE_API_URL` | URL API untuk frontend | `https://api.domain.com` |

### SSL dengan Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Generate SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal sudah dikonfigurasi otomatis
# Test renewal:
sudo certbot renew --dry-run
```

### Firewall

```bash
# Setup UFW firewall
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

---

## 5. Penggunaan Aplikasi

### Alur Kerja Utama

```
┌─────────────────────────────────────────────────────────┐
│                    SETUP AWAL                            │
├─────────────────────────────────────────────────────────┤
│  1. Login sebagai Admin                                  │
│  2. Buat akun Mitra baru (optional)                     │
│  3. Assign role ke user                                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 SETUP PER MITRA                          │
├─────────────────────────────────────────────────────────┤
│  1. Buat Studio (tempat live)                            │
│  2. Tambah Akun Shopee ke Studio                         │
│  3. Upload Gudang Produk (Product Master)               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 OPERASIONAL HARIAN                       │
├─────────────────────────────────────────────────────────┤
│  1. Upload statistik CSV dari Shopee                     │
│  2. Review performance di halaman Statistics            │
│  3. Jalankan optimasi produk                             │
│  4. Copy produk untuk rotasi live                        │
└─────────────────────────────────────────────────────────┘
```

### Fitur per Halaman

| Halaman | Fungsi |
|---------|--------|
| `/dashboard` | Overview statistik & quick actions |
| `/studios` | Kelola studio (nama, deskripsi) |
| `/accounts` | Kelola akun Shopee per studio |
| `/products` | Upload & kelola gudang produk |
| `/statistics` | Lihat & analisa performance produk |
| `/optimize` | Jalankan optimasi rotasi produk |
| `/settings` | Pengaturan profil user |
| `/admin/*` | Menu admin (hanya untuk role admin) |

### API Endpoints

**Authentication:**
```
POST /api/auth/register   - Daftar user baru
POST /api/auth/login      - Login
GET  /api/auth/me         - Get current user
PUT  /api/auth/profile    - Update profile
```

**Studios:**
```
GET    /api/studios       - List studios
POST   /api/studios       - Create studio
PUT    /api/studios/:id   - Update studio
DELETE /api/studios/:id   - Delete studio
```

**Accounts:**
```
GET    /api/accounts             - List accounts
GET    /api/accounts?studioId=x  - Filter by studio
POST   /api/accounts             - Create account
PUT    /api/accounts/:id         - Update account
DELETE /api/accounts/:id         - Delete account
```

**Products:**
```
GET    /api/products              - List products
POST   /api/products              - Create product
POST   /api/products/bulk         - Bulk create
DELETE /api/products/:id          - Delete product
```

**Statistics:**
```
GET  /api/statistics              - Get statistics with filters
POST /api/statistics/bulk         - Bulk insert from CSV
```

**Optimization:**
```
GET  /api/optimize/rotation       - Get active rotation
POST /api/optimize/rotation       - Set rotation
POST /api/optimize/run            - Run optimization
GET  /api/optimize/history        - Get history
```

---

## 6. Troubleshooting

### Database Connection Error

```bash
# Cek PostgreSQL running
sudo systemctl status postgresql

# Cek bisa connect
psql -U livesync -d livesync -h localhost -c "SELECT 1"

# Cek logs
docker compose logs postgres
# atau
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### API Error 500

```bash
# Cek backend logs
docker compose logs backend
# atau
pm2 logs livesync-api

# Cek environment variables
docker compose exec backend env | grep DATABASE
```

### Frontend 404 on Refresh

Pastikan Nginx config punya:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

### JWT Token Invalid

```bash
# Pastikan JWT_SECRET sama di backend
# Jika diubah, semua user harus login ulang

# Clear browser localStorage:
# Developer Tools > Application > Local Storage > Clear
```

### Reset Admin Password

```bash
# Generate new bcrypt hash
node -e "console.log(require('bcryptjs').hashSync('newpassword', 10))"

# Update di database
docker exec -it livesync-db psql -U livesync -d livesync -c "
UPDATE users SET password_hash = 'NEW_HASH' WHERE email = 'admin@livesync.local';
"
```

### Backup Database

```bash
# Backup
docker exec livesync-db pg_dump -U livesync livesync > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
docker exec -i livesync-db psql -U livesync livesync < backup_file.sql
```

### Update Aplikasi

```bash
# Pull latest code
git pull origin main

# Rebuild dan restart
docker compose down
docker compose build --no-cache
docker compose up -d

# Untuk manual install:
cd backend && npm install && npm run build
pm2 restart livesync-api

cd .. && npm install && npm run build
sudo cp -r dist/* /var/www/livesync/
```

---

## Bantuan Lebih Lanjut

Jika mengalami masalah:

1. Cek logs terlebih dahulu
2. Pastikan semua environment variables sudah benar
3. Restart service yang bermasalah
4. Buka issue di repository

---

**Selamat menggunakan LiveSync! 🚀**
