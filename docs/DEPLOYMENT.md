# LiveSync Deployment Guide

## Prerequisites

- Docker & Docker Compose installed
- Git
- (Optional) Domain name with SSL certificate

## Quick Start with Docker

### 1. Clone and Configure

```bash
# Clone the repository
git clone <your-repo-url>
cd livesync

# Copy environment template
cp backend/.env.example backend/.env

# Edit environment variables
nano backend/.env
```

### 2. Configure Environment Variables

Edit `.env` file in project root:

```env
# REQUIRED - Change these!
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters

# Database (auto-configured by docker-compose)
DATABASE_URL=postgres://livesync:livesync_secret_password@postgres:5432/livesync

# Frontend URL (change for production)
FRONTEND_URL=http://your-domain.com
VITE_API_URL=http://your-domain.com:3001
```

### 3. Start Services

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### 4. Access Application

- Frontend: http://localhost (or your domain)
- Backend API: http://localhost:3001
- Health check: http://localhost:3001/health

## Default Admin Account

After first run, a default admin account is created:
- Email: `admin@livesync.local`
- Password: You need to reset this via database

To set admin password:

```bash
# Connect to database
docker exec -it livesync-db psql -U livesync -d livesync

# Generate bcrypt hash (use online tool or script)
# Update password
UPDATE users SET password_hash = '$2b$10$YOUR_BCRYPT_HASH' WHERE email = 'admin@livesync.local';
```

## Manual Deployment (Without Docker)

### 1. Setup PostgreSQL

```bash
# Install PostgreSQL 15+
sudo apt install postgresql-15

# Create database and user
sudo -u postgres psql
CREATE USER livesync WITH PASSWORD 'your_password';
CREATE DATABASE livesync OWNER livesync;
\q

# Import schema
psql -U livesync -d livesync -f database/init.sql
```

### 2. Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env

# Build
npm run build

# Start (use PM2 for production)
npm install -g pm2
pm2 start dist/index.js --name livesync-api
```

### 3. Setup Frontend

```bash
# Install dependencies
npm install

# Configure environment
echo "VITE_API_URL=http://your-api-url:3001" > .env

# Build
npm run build

# Serve with Nginx
sudo cp -r dist/* /var/www/html/
```

### 4. Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## SSL Configuration (Recommended)

### Using Certbot (Let's Encrypt)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

## Backup & Restore

### Backup Database

```bash
# Create backup
docker exec livesync-db pg_dump -U livesync livesync > backup_$(date +%Y%m%d).sql

# Or with docker-compose
docker-compose exec postgres pg_dump -U livesync livesync > backup.sql
```

### Restore Database

```bash
# Restore from backup
docker exec -i livesync-db psql -U livesync livesync < backup.sql
```

## Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f postgres
```

### Health Checks

```bash
# API health
curl http://localhost:3001/health

# Database connection
docker exec livesync-db pg_isready -U livesync
```

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Test connection
docker exec -it livesync-db psql -U livesync -d livesync -c "SELECT 1"
```

### API Not Starting

```bash
# Check backend logs
docker-compose logs backend

# Verify environment variables
docker-compose exec backend env | grep DATABASE
```

### Frontend 404 on Refresh

Ensure nginx is configured with `try_files $uri $uri/ /index.html;`

## Updating

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Run migrations if any
docker exec -it livesync-db psql -U livesync -d livesync -f /path/to/migration.sql
```
