# OCI Deployment Guide for FitFlow

## Overview
This guide covers deploying FitFlow on Oracle Cloud Infrastructure (OCI) Free Tier using CloudPanel for server management.

## Infrastructure Setup

### OCI Resources (Always Free Tier)

#### 1. Compute Instance (ARM VM)
- **Shape**: VM.Standard.A1.Flex
- **OCPUs**: 4 (ARM-based Ampere A1)
- **Memory**: 24 GB
- **Boot Volume**: 50 GB
- **OS**: Ubuntu 22.04 LTS
- **Region**: Canada Southeast (Toronto) - ca-toronto-1

#### 2. MySQL HeatWave
- **Type**: MySQL Database Service with HeatWave
- **Storage**: 50 GB (Free Tier)
- **Shape**: MySQL.VM.Standard.E3.1.8GB
- **Version**: MySQL 8.0
- **Features**: 
  - In-memory query acceleration
  - Built-in machine learning
  - Real-time analytics
- **Portability**: Compatible with AWS RDS MySQL, Azure Database for MySQL, Google Cloud SQL

#### 3. Object Storage
- **Namespace**: Your tenancy namespace
- **Buckets**: 
  - `fitflow-dev` (development)
  - `fitflow-prod` (production)
- **Storage**: 20 GB total
- **Access**: S3-compatible APIs

#### 4. Load Balancer
- **Bandwidth**: 10 Mbps
- **Type**: Flexible Load Balancer
- **SSL Termination**: Yes

## CloudPanel Configuration

### Initial Setup
```bash
# Access CloudPanel
https://your-oci-public-ip:8443
Username: admin
Password: [set during installation]
```

### Domain Configuration
1. Add domain: `test.fitflow.example.com`
2. Document root: `/home/cloudpanel/htdocs/test.fitflow.example.com`
3. PHP: Not required (Node.js app)
4. SSL: Enable Let's Encrypt

### System Requirements
```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build tools (for native modules)
sudo apt-get install -y build-essential python3

# Install Oracle Instant Client (for Autonomous Database)
sudo apt-get install -y libaio1 wget unzip

# Download Oracle Instant Client
cd /tmp
wget https://download.oracle.com/otn_software/linux/instantclient/instantclient-basic-linux-arm64.zip
sudo mkdir -p /opt/oracle
sudo unzip instantclient-basic-linux-arm64.zip -d /opt/oracle/
sudo sh -c "echo /opt/oracle/instantclient_21_10 > /etc/ld.so.conf.d/oracle-instantclient.conf"
sudo ldconfig

# Install PM2
sudo npm install -g pm2
```

## Database Setup

### MySQL HeatWave Configuration

1. **Create MySQL HeatWave Instance**:
   ```bash
   # Via OCI Console or CLI
   oci mysql db-system create \
     --compartment-id <compartment-ocid> \
     --shape-name "MySQL.VM.Standard.E3.1.8GB" \
     --subnet-id <subnet-ocid> \
     --admin-username admin \
     --admin-password <secure-password> \
     --data-storage-size-in-gbs 50 \
     --is-highly-available false \
     --availability-domain <ad-name>
   ```

2. **Enable HeatWave Cluster** (Optional for analytics):
   ```bash
   # Add HeatWave cluster for real-time analytics
   oci mysql heat-wave-cluster create \
     --db-system-id <mysql-db-system-id> \
     --shape-name "HeatWave.VM.Standard.E3" \
     --cluster-size 1
   ```

3. **Connect to MySQL**:
   ```bash
   # Standard MySQL connection
   mysql -h <mysql-endpoint> -u admin -p fitflow
   
   # Or using MySQL Shell
   mysqlsh admin@<mysql-endpoint>:3306/fitflow
   ```

### Database Schema Setup

1. **Create Database and User**:
   ```sql
   CREATE DATABASE IF NOT EXISTS fitflow;
   CREATE USER 'fitflow_app'@'%' IDENTIFIED BY '<secure-password>';
   GRANT ALL PRIVILEGES ON fitflow.* TO 'fitflow_app'@'%';
   FLUSH PRIVILEGES;
   ```

2. **PostgreSQL to MySQL Migration Notes**:
   - `UUID` → `CHAR(36)` with UUID() function
   - `JSONB` → `JSON` native type (MySQL 5.7+)
   - `BOOLEAN` → `BOOLEAN` or `TINYINT(1)`
   - `SERIAL` → `AUTO_INCREMENT`
   - `NOW()` → `NOW()` (compatible)
   - Arrays → JSON arrays

### Cloud Portability Benefits

MySQL HeatWave provides excellent portability:

1. **AWS Migration**: Direct compatibility with Amazon RDS for MySQL
2. **Azure Migration**: Works with Azure Database for MySQL
3. **Google Cloud**: Compatible with Cloud SQL for MySQL
4. **On-Premise**: Standard MySQL 8.0 compatibility

## Application Deployment

### Environment Configuration

Create `.env` files for each service:

```bash
# /services/auth/.env
NODE_ENV=development
PORT=3001

# MySQL HeatWave Connection
DB_HOST=<mysql-endpoint>
DB_PORT=3306
DB_USER=fitflow_app
DB_PASSWORD=your_secure_password
DB_NAME=fitflow
DB_SSL_CA=/etc/ssl/certs/ca-certificates.crt

# Redis (CloudPanel)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_jwt_secret_here
REFRESH_TOKEN_SECRET=your_refresh_secret_here

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# OCI Object Storage
OCI_STORAGE_NAMESPACE=your_namespace
OCI_STORAGE_BUCKET=fitflow-dev
OCI_STORAGE_REGION=ca-toronto-1
OCI_ACCESS_KEY=your_access_key
OCI_SECRET_KEY=your_secret_key
```

### PM2 Ecosystem File

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'fitflow-auth',
      script: './services/auth/index.js',
      cwd: '/home/cloudpanel/htdocs/test.fitflow.example.com',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      error_file: './logs/auth-error.log',
      out_file: './logs/auth-out.log',
      log_file: './logs/auth-combined.log',
      time: true
    },
    {
      name: 'fitflow-payment',
      script: './services/payment/index.js',
      cwd: '/home/cloudpanel/htdocs/test.fitflow.example.com',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3002
      },
      error_file: './logs/payment-error.log',
      out_file: './logs/payment-out.log',
      log_file: './logs/payment-combined.log',
      time: true
    },
    {
      name: 'fitflow-notification',
      script: './services/notification/index.js',
      cwd: '/home/cloudpanel/htdocs/test.fitflow.example.com',
      instances: 1,
      env: {
        NODE_ENV: 'development',
        PORT: 3003
      },
      error_file: './logs/notification-error.log',
      out_file: './logs/notification-out.log',
      log_file: './logs/notification-combined.log',
      time: true
    }
  ]
};
```

### Nginx Configuration

Add to CloudPanel vhost configuration:

```nginx
# Proxy settings for Node.js services
location /api/auth {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 86400;
}

location /api/payment {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

location /api/notifications {
    proxy_pass http://127.0.0.1:3003;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

# Frontend (if serving from same domain)
location / {
    root /home/cloudpanel/htdocs/test.fitflow.example.com/frontend/build;
    try_files $uri $uri/ /index.html;
}
```

## Deployment Steps

1. **Clone Repository**:
   ```bash
   cd /home/cloudpanel/htdocs
   git clone https://github.com/czhaoca/FitFlow.git test.fitflow.example.com
   cd test.fitflow.example.com
   ```

2. **Install Dependencies**:
   ```bash
   # Install service dependencies
   cd services/auth && npm install
   cd ../payment && npm install
   cd ../notification && npm install
   cd ../..
   ```

3. **Setup Environment**:
   ```bash
   # Copy and configure .env files
   cp services/auth/.env.example services/auth/.env
   cp services/payment/.env.example services/payment/.env
   cp services/notification/.env.example services/notification/.env
   
   # Edit each .env file with your credentials
   ```

4. **Start Services**:
   ```bash
   # Start with PM2
   pm2 start ecosystem.config.js
   
   # Save PM2 configuration
   pm2 save
   pm2 startup systemd -u cloudpanel --hp /home/cloudpanel
   ```

5. **Verify Deployment**:
   ```bash
   # Check service status
   pm2 status
   
   # View logs
   pm2 logs
   
   # Test endpoints
   curl https://test.fitflow.example.com/api/auth/health
   curl https://test.fitflow.example.com/api/payment/health
   curl https://test.fitflow.example.com/api/notifications/health
   ```

## Monitoring and Maintenance

### PM2 Monitoring
```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs [app-name]

# Restart service
pm2 restart [app-name]

# Reload with zero downtime
pm2 reload all
```

### Log Rotation
```bash
# Install PM2 log rotate
pm2 install pm2-logrotate

# Configure
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### Backup Strategy
1. **Database**: Autonomous Database automatic backups
2. **Object Storage**: Cross-region replication
3. **Application**: Git repository
4. **Configurations**: Regular backups of .env files

## Security Considerations

1. **Firewall Rules** (OCI Security Lists):
   - Port 443 (HTTPS) - Public
   - Port 22 (SSH) - Restricted to your IP
   - Port 8443 (CloudPanel) - Restricted
   - Internal ports (3001-3003) - Localhost only

2. **SSL/TLS**:
   - CloudPanel auto-renews Let's Encrypt certificates
   - Force HTTPS redirect
   - Use secure headers

3. **Database Security**:
   - mTLS connections required
   - Wallet-based authentication
   - Network access control

4. **Application Security**:
   - Environment variables for secrets
   - JWT token rotation
   - Rate limiting enabled
   - CORS properly configured

## Troubleshooting

### Common Issues

1. **Database Connection**:
   ```bash
   # Check TNS_ADMIN
   echo $TNS_ADMIN
   
   # Test connection
   node -e "const oracledb = require('oracledb'); 
   oracledb.getConnection({user: 'FITFLOW_APP', password: 'xxx', 
   connectionString: 'fitflowdev_high'}).then(c => console.log('Connected!'))"
   ```

2. **Permission Issues**:
   ```bash
   # Fix permissions
   sudo chown -R cloudpanel:cloudpanel /home/cloudpanel/htdocs/test.fitflow.example.com
   ```

3. **Port Conflicts**:
   ```bash
   # Check port usage
   sudo netstat -tlnp | grep :300
   ```

4. **Memory Issues** (ARM optimization):
   ```bash
   # Adjust Node.js memory
   pm2 start app.js --node-args="--max-old-space-size=2048"
   ```