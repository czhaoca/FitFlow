# FitFlow Development Guidelines

## Overview
This document contains critical development guidelines and best practices for FitFlow development. All developers should follow these guidelines to ensure consistency, maintainability, and scalability.

## Technology Stack

### Cloud Infrastructure (OCI Free Tier)
- **Primary Server**: OCI ARM VM (Ampere A1)
  - 4 OCPUs (ARM-based)
  - 24 GB RAM
  - 50 GB Boot Volume
  - Ubuntu 22.04 LTS
  - CloudPanel for server management
- **Database**: OCI Autonomous Database (Always Free)
  - 20 GB storage for transactional workloads
  - Auto-scaling OCPU
  - Built-in backups and high availability
  - Oracle APEX included (for admin interfaces)
- **Object Storage**: OCI Object Storage
  - 20 GB Always Free storage
  - S3-compatible APIs
  - Public/Private buckets
  - CDN-ready with OCI's global network
- **Load Balancer**: OCI Load Balancer (Always Free)
  - 10 Mbps bandwidth
  - SSL termination
  - Health checks

### Development Environment
- **Host**: CloudPanel on OCI ARM VM
  - Multi-PHP version support
  - Built-in Redis
  - MySQL/MariaDB (for CloudPanel only)
  - Nginx with custom vhosts
  - Free SSL via Let's Encrypt
- **Test Domain**: test.fitflow.example.com (with SSL)
- **Development Database**: OCI Autonomous Database (dev instance)
- **Connection Security**: SSL/TLS for all connections

### Core Technologies
- **Backend**: Node.js 20 LTS with Express.js
- **Frontend**: React 18 with Next.js 14 (PWA)
- **Database**: OCI Autonomous Database (Oracle 19c compatible)
  - Uses Oracle REST Data Services (ORDS)
  - Compatible with node-oracledb driver
- **Storage**: OCI Object Storage (S3-compatible)
  - AWS SDK compatible
  - Pre-authenticated requests for secure uploads
- **Cache/Queue**: Redis 7 (included in CloudPanel)
  - Bull for job queuing
  - Session storage
  - WebAuthn challenge storage
- **Process Manager**: PM2 for Node.js apps
- **Reverse Proxy**: Nginx (CloudPanel managed)

## Architecture Principles

### Microservices Architecture
The application is built using microservices to ensure:
- **Scalability**: Each service can scale independently
- **Multi-Studio Support**: Owner can manage multiple studio locations
- **Maintainability**: Clear service boundaries
- **Resilience**: Service isolation prevents cascading failures

### SOLID Principles
1. **Single Responsibility**: Each service/module has one reason to change
2. **Open/Closed**: Open for extension, closed for modification
3. **Liskov Substitution**: Derived classes must be substitutable
4. **Interface Segregation**: Many specific interfaces over general ones
5. **Dependency Inversion**: Depend on abstractions, not concretions

### Best Practices
- **DRY** (Don't Repeat Yourself)
- **KISS** (Keep It Simple, Stupid)
- **YAGNI** (You Aren't Gonna Need It)
- **Clean Code**: Self-documenting, readable code
- **Test-Driven Development**: Write tests first
- **Continuous Integration**: Frequent commits and builds

## Environment Configuration

### Environment Management
```bash
# Development (OCI Test Environment)
NODE_ENV=development
API_URL=https://test.fitflow.example.com
DB_CONNECTION_STRING=tcps://adb.ca-toronto-1.oraclecloud.com:1522/xyz123_fitflowdev_high.adb.oraclecloud.com
ORDS_BASE_URL=https://xyz123-fitflowdev.adb.ca-toronto-1.oraclecloudapps.com/ords
OCI_STORAGE_NAMESPACE=namespace123
OCI_STORAGE_BUCKET_NAME=fitflow-dev
OCI_STORAGE_REGION=ca-toronto-1

# Production
NODE_ENV=production
API_URL=https://api.fitflow.ca
DB_CONNECTION_STRING=tcps://adb.ca-toronto-1.oraclecloud.com:1522/xyz123_fitflowprod_high.adb.oraclecloud.com
ORDS_BASE_URL=https://xyz123-fitflowprod.adb.ca-toronto-1.oraclecloudapps.com/ords
OCI_STORAGE_NAMESPACE=namespace123
OCI_STORAGE_BUCKET_NAME=fitflow-prod
OCI_STORAGE_REGION=ca-toronto-1
```

### Feature Flags
```javascript
// config/features.js
module.exports = {
  features: {
    aiSummaries: process.env.FEATURE_AI_SUMMARIES === 'true',
    multiStudio: process.env.FEATURE_MULTI_STUDIO === 'true',
    advancedAnalytics: process.env.FEATURE_ANALYTICS === 'true'
  }
};
```

## Development Workflow

### Git Workflow
1. **Branch Naming**:
   - `feature/description` - New features
   - `fix/description` - Bug fixes
   - `refactor/description` - Code refactoring
   - `docs/description` - Documentation

2. **Commit Message Convention**:
   - Follow [Conventional Commits](https://www.conventionalcommits.org/)
   - Format: `type(scope): description`
   - Types:
     - `feat`: New feature
     - `fix`: Bug fix
     - `docs`: Documentation changes
     - `style`: Code style changes (formatting, semicolons, etc)
     - `refactor`: Code refactoring
     - `test`: Adding or updating tests
     - `chore`: Maintenance tasks
     - `perf`: Performance improvements
     - `ci`: CI/CD changes
   - Examples:
     - `feat(auth): add OAuth2 integration`
     - `fix(scheduling): resolve timezone conversion bug`
     - `docs(api): update endpoint documentation`
   - Keep commits atomic and focused

3. **Pull Requests**:
   - Must pass all tests
   - Require code review
   - Update documentation as needed

### Change Log Management
Each development session/conversation should be documented in the CHANGELOG.md file:

1. **Session Documentation**:
   ```markdown
   ## [Session Date] - YYYY-MM-DD
   
   ### Added
   - List of features added
   
   ### Changed
   - List of changes made
   
   ### Fixed
   - List of bugs fixed
   
   ### Conversation ID
   - Reference to the conversation/session ID
   ```

2. **Iteration Tracking**:
   - Every significant change should be logged
   - Include conversation context
   - Reference commit hashes
   - Document decision rationale

### CI/CD Pipeline
```yaml
# GitHub Actions workflow
name: CI/CD Pipeline
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
```

## Deployment

### CloudPanel Deployment on OCI

1. **CloudPanel Setup** (Already installed on OCI ARM VM):
   ```bash
   # Access CloudPanel at: https://your-oci-ip:8443
   # Default user: admin
   ```

2. **Node.js Application Setup**:
   ```bash
   # SSH into server
   ssh ubuntu@your-oci-ip
   
   # Install Node.js 20 LTS
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PM2 globally
   sudo npm install -g pm2
   
   # Clone repository
   cd /home/cloudpanel/htdocs
   git clone https://github.com/czhaoca/FitFlow.git test.fitflow.example.com
   cd test.fitflow.example.com
   ```

3. **Environment Configuration**:
   ```bash
   # Create environment files for each service
   cp services/auth/.env.example services/auth/.env
   cp services/payment/.env.example services/payment/.env
   cp services/notification/.env.example services/notification/.env
   
   # Edit with OCI Autonomous Database credentials
   nano services/auth/.env
   ```

4. **PM2 Ecosystem Configuration**:
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [
       {
         name: 'fitflow-auth',
         script: './services/auth/index.js',
         instances: 2,
         exec_mode: 'cluster',
         env: {
           NODE_ENV: 'development',
           PORT: 3001
         }
       },
       {
         name: 'fitflow-payment',
         script: './services/payment/index.js',
         instances: 2,
         exec_mode: 'cluster',
         env: {
           NODE_ENV: 'development',
           PORT: 3002
         }
       },
       {
         name: 'fitflow-notification',
         script: './services/notification/index.js',
         instances: 1,
         env: {
           NODE_ENV: 'development',
           PORT: 3003
         }
       }
     ]
   };
   ```

5. **Nginx Configuration** (via CloudPanel):
   ```nginx
   # Custom Nginx configuration for test.fitflow.example.com
   location /api/auth {
       proxy_pass http://127.0.0.1:3001;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
   }
   
   location /api/payment {
       proxy_pass http://127.0.0.1:3002;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
   }
   
   location /api/notifications {
       proxy_pass http://127.0.0.1:3003;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
   }
   ```

6. **Start Services**:
   ```bash
   # Start all services with PM2
   pm2 start ecosystem.config.js
   
   # Save PM2 configuration
   pm2 save
   pm2 startup
   ```

### SSL Configuration
CloudPanel automatically provisions Let's Encrypt SSL certificates:
1. Add domain in CloudPanel
2. Enable SSL/TLS
3. Force HTTPS redirect

## AWS-Compatible Services

### S3-Compatible Storage
```javascript
// Use AWS SDK with OCI Object Storage
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  endpoint: process.env.OCI_S3_ENDPOINT,
  accessKeyId: process.env.OCI_ACCESS_KEY,
  secretAccessKey: process.env.OCI_SECRET_KEY,
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});

// Same code works with Cloudflare R2
const r2 = new AWS.S3({
  endpoint: process.env.R2_ENDPOINT,
  accessKeyId: process.env.R2_ACCESS_KEY,
  secretAccessKey: process.env.R2_SECRET_KEY
});
```

### OCI Autonomous Database Connection
```javascript
// Use node-oracledb for OCI Autonomous Database
const oracledb = require('oracledb');

// Enable thick mode for full compatibility
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient' });

// Connection configuration
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionString: process.env.DB_CONNECTION_STRING,
  poolMin: 10,
  poolMax: 40,
  poolIncrement: 5,
  poolTimeout: 60
};

// Create connection pool
async function initializeDatabase() {
  try {
    await oracledb.createPool(dbConfig);
    console.log('Database pool created');
  } catch (err) {
    console.error('Error creating pool:', err);
  }
}

// For PostgreSQL compatibility layer
// Use ORDS (Oracle REST Data Services) for REST APIs
const ordsBaseUrl = process.env.ORDS_BASE_URL;
```

## Security Best Practices

### Environment Variables
- Never commit secrets to repository
- Use `.env` files for local development
- Use OCI/Cloudflare secrets management for production
- Rotate credentials regularly

### API Security
- JWT tokens with short expiration
- Rate limiting on all endpoints
- Input validation and sanitization
- SQL injection prevention
- XSS protection

### HIPAA Compliance
- Encrypt all PHI at rest and in transit
- Audit all data access
- Implement access controls
- Regular security audits
- Data retention policies

## Monitoring & Logging

### Application Monitoring
```javascript
// Use OpenTelemetry for observability
const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('fitflow-service');

// Instrument code
const span = tracer.startSpan('process-payment');
try {
  // Process payment
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR });
} finally {
  span.end();
}
```

### Centralized Logging
```javascript
// Use Winston for logging
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

## Testing Strategy

### Unit Tests
```javascript
// Jest for unit testing
describe('InvoiceService', () => {
  it('should calculate tax correctly', () => {
    const invoice = new Invoice({ subtotal: 100 });
    expect(invoice.calculateTax()).toBe(5);
  });
});
```

### Integration Tests
```javascript
// Supertest for API testing
const request = require('supertest');
const app = require('../app');

describe('POST /api/auth/login', () => {
  it('should return JWT token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password' });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});
```

### E2E Tests
```javascript
// Playwright for E2E testing
const { test, expect } = require('@playwright/test');

test('user can create appointment', async ({ page }) => {
  await page.goto('/appointments/new');
  await page.fill('#client', 'John Doe');
  await page.click('#submit');
  await expect(page).toHaveURL('/appointments/success');
});
```

## Commands to Run

### Development
```bash
npm run lint        # Run ESLint
npm run typecheck   # Run TypeScript checks
npm test           # Run unit tests
npm run test:e2e   # Run E2E tests
npm run dev        # Start development server
```

### Production
```bash
npm run build      # Build for production
npm run start      # Start production server
npm run migrate    # Run database migrations
```

## Continuous Improvement

- **Code Reviews**: All code must be reviewed before merging
- **Performance Monitoring**: Track API response times
- **User Feedback**: Regular feedback cycles
- **Technical Debt**: Allocate time for refactoring
- **Documentation**: Keep docs up-to-date

## Contact & Support

For questions or issues:
- Create GitHub issue
- Contact: dev@fitflow.ca
- Documentation: https://docs.fitflow.ca