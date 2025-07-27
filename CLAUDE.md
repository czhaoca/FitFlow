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
- **Database**: MySQL HeatWave (Always Free)
  - 50 GB storage
  - 1 OCPU
  - Automated backups
  - High availability
  - HeatWave analytics for real-time insights
  - Cloud-portable (compatible with AWS RDS MySQL, Azure Database for MySQL, Google Cloud SQL)
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
- **Database**: MySQL HeatWave 8.0
  - Standard MySQL protocol
  - Compatible with mysql2 Node.js driver
  - Cloud-portable SQL syntax
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

### Multi-Tenancy Strategy (DECIDED)
**Decision**: Shared Tables with Tenant ID approach

**Implementation**:
- All tables include a `tenant_id` (UUID) column representing the studio
- Trainers can be associated with multiple studios via a junction table
- Row-Level Security (RLS) policies enforce data isolation
- Composite indexes on (tenant_id, primary_key) for performance

**Key Considerations**:
- Trainers may work at multiple studios on the same day
- Studios are small to medium sized (not 1000s of clients)
- Simplicity and maintainability are priorities
- Cross-studio reporting needed for franchise owners

**Example Schema**:
```sql
-- Studios table
CREATE TABLE studios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  owner_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trainers can work at multiple studios
CREATE TABLE trainer_studios (
  trainer_id UUID NOT NULL,
  studio_id UUID NOT NULL,
  role VARCHAR(50) DEFAULT 'trainer',
  PRIMARY KEY (trainer_id, studio_id)
);

-- All other tables include tenant_id
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL, -- Studio ID
  trainer_id UUID NOT NULL,
  client_id UUID NOT NULL,
  start_time TIMESTAMP NOT NULL,
  -- ... other fields
  FOREIGN KEY (tenant_id) REFERENCES studios(id)
);

-- Composite indexes for performance
CREATE INDEX idx_appointments_tenant ON appointments(tenant_id, start_time);
```

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
DB_HOST=mysql-xxxxxx.mysql.database.oraclecloud.com
DB_PORT=3306
DB_USER=fitflow_dev
DB_PASSWORD=secure_password
DB_NAME=fitflow_dev
OCI_STORAGE_NAMESPACE=namespace123
OCI_STORAGE_BUCKET_NAME=fitflow-dev
OCI_STORAGE_REGION=ca-toronto-1

# Production
NODE_ENV=production
API_URL=https://api.fitflow.ca
DB_HOST=mysql-xxxxxx.mysql.database.oraclecloud.com
DB_PORT=3306
DB_USER=fitflow_prod
DB_PASSWORD=secure_password
DB_NAME=fitflow_prod
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

### MySQL HeatWave Connection
```javascript
// Use mysql2 for MySQL HeatWave
const mysql = require('mysql2/promise');

// Connection configuration
const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 40,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: {
    // MySQL HeatWave requires SSL
    rejectUnauthorized: true
  }
};

// Create connection pool
let pool;
async function initializeDatabase() {
  try {
    pool = await mysql.createPool(dbConfig);
    console.log('MySQL connection pool created');
  } catch (err) {
    console.error('Error creating pool:', err);
  }
}

// Query with automatic tenant filtering
async function query(sql, params, tenantId) {
  const connection = await pool.getConnection();
  try {
    // Set session variable for tenant context
    if (tenantId) {
      await connection.execute('SET @tenant_id = ?', [tenantId]);
    }
    const [results] = await connection.execute(sql, params);
    return results;
  } finally {
    connection.release();
  }
}
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

### Multi-Tenant Security
- **Tenant Isolation**: All queries must include tenant_id filter
- **JWT Claims**: Include allowed studio IDs in JWT tokens
- **Middleware Enforcement**: Automatic tenant_id injection in queries
- **Cross-Tenant Validation**: Verify trainer has access to requested studio
- **Audit Trail**: Log all cross-studio access attempts

```javascript
// Example middleware for tenant isolation
const tenantIsolation = (req, res, next) => {
  const userStudios = req.user.studios; // From JWT
  const requestedStudio = req.params.studioId || req.body.studioId;
  
  if (!userStudios.includes(requestedStudio)) {
    return res.status(403).json({ error: 'Access denied to this studio' });
  }
  
  req.tenantId = requestedStudio;
  next();
};
```

### HIPAA Compliance
- Encrypt all PHI at rest and in transit
- Audit all data access
- Implement access controls
- Regular security audits
- Data retention policies

### Field-Level Encryption (DECIDED)
**Decision**: Application-level field encryption for sensitive data

**Implementation**:
```javascript
const crypto = require('crypto');

class FieldEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyDerivationIterations = 100000;
  }

  // Derive key from master key and salt
  deriveKey(masterKey, salt) {
    return crypto.pbkdf2Sync(masterKey, salt, this.keyDerivationIterations, 32, 'sha256');
  }

  // Encrypt sensitive field
  encryptField(data, fieldName) {
    const salt = crypto.randomBytes(16);
    const key = this.deriveKey(process.env.MASTER_KEY, salt);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext: encrypted,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: this.algorithm,
      fieldName: fieldName
    };
  }
  
  // Decrypt sensitive field
  decryptField(encryptedData) {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const key = this.deriveKey(process.env.MASTER_KEY, salt);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }
}

// Usage example
const encryption = new FieldEncryption();

// Encrypt medical info before storage
const encryptedMedical = encryption.encryptField(
  medicalInfo, 
  'medical_info'
);

// Store encrypted data in database
await db.query(
  'UPDATE clients SET medical_info = ? WHERE id = ?',
  [JSON.stringify(encryptedMedical), clientId]
);
```

**Key Management**:
- Master key stored in environment variable (use OCI Secrets in production)
- Data encryption keys derived per field with unique salt
- Monthly key rotation for data keys
- Annual rotation for master key

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

## API Gateway Architecture (DECIDED)
**Decision**: Custom API Gateway for better control and readability

**Implementation**:
```javascript
// Custom API Gateway implementation
class APIGateway {
  constructor() {
    this.routes = new Map();
    this.middleware = [];
  }

  // Register service routes
  registerService(serviceName, serviceUrl, routes) {
    routes.forEach(route => {
      const key = `${route.method}:${route.path}`;
      this.routes.set(key, {
        service: serviceName,
        url: serviceUrl,
        handler: route.handler,
        requiresAuth: route.requiresAuth !== false,
        rateLimit: route.rateLimit || 100
      });
    });
  }

  // Main gateway handler
  async handleRequest(req, res) {
    const key = `${req.method}:${req.path}`;
    const route = this.routes.get(key);
    
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }
    
    // Apply middleware
    for (const mw of this.middleware) {
      const result = await mw(req, res, route);
      if (result === false) return; // Middleware handled response
    }
    
    // Forward to service
    try {
      const response = await fetch(`${route.url}${req.path}`, {
        method: req.method,
        headers: {
          ...req.headers,
          'X-Tenant-ID': req.tenantId,
          'X-User-ID': req.userId
        },
        body: req.body ? JSON.stringify(req.body) : undefined
      });
      
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error(`Gateway error for ${route.service}:`, error);
      res.status(502).json({ error: 'Service unavailable' });
    }
  }
}
```

## Caching Strategy (DECIDED)
**Decision**: Smart caching with data-specific TTLs

**Implementation**:
```javascript
class SmartCache {
  constructor(redis) {
    this.redis = redis;
    this.ttls = {
      // Real-time data - very short or no cache
      appointment_availability: 10, // 10 seconds
      current_appointments: 0, // No cache
      
      // Frequently accessed, changes occasionally
      trainer_profile: 300, // 5 minutes
      studio_info: 600, // 10 minutes
      
      // Historical/reporting data - longer cache
      monthly_report: 1800, // 30 minutes
      analytics_dashboard: 900, // 15 minutes
      client_history: 600, // 10 minutes
    };
  }
  
  async get(key, dataType) {
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  }
  
  async set(key, data, dataType) {
    const ttl = this.ttls[dataType] || 300; // Default 5 min
    if (ttl > 0) {
      await this.redis.setex(key, ttl, JSON.stringify(data));
    }
  }
  
  // Cache invalidation for critical updates
  async invalidate(pattern) {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

## Payment Architecture (DECIDED)
**Decision**: Abstraction layer supporting Stripe + Interac e-Transfer

**Implementation**:
```javascript
// Payment provider abstraction
class PaymentService {
  constructor() {
    this.providers = {
      stripe: new StripeProvider(),
      interac: new InteracProvider()
    };
    this.supportedCurrencies = ['CAD', 'USD'];
  }
  
  async processPayment(params) {
    const { amount, currency, method, metadata } = params;
    
    // Validate currency
    if (!this.supportedCurrencies.includes(currency)) {
      throw new Error(`Currency ${currency} not supported`);
    }
    
    // Select provider based on method
    const provider = method === 'etransfer' ? 'interac' : 'stripe';
    
    // Generate idempotency key
    const idempotencyKey = this.generateIdempotencyKey(metadata);
    
    // Check if already processed
    const existing = await this.checkIdempotency(idempotencyKey);
    if (existing) return existing;
    
    // Process payment synchronously
    const result = await this.providers[provider].process({
      amount,
      currency,
      metadata,
      idempotencyKey
    });
    
    // Store result with idempotency key
    await this.storePaymentResult(idempotencyKey, result);
    
    return result;
  }
  
  generateIdempotencyKey(metadata) {
    const data = `${metadata.userId}-${metadata.appointmentId}-${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

// Interac e-Transfer provider
class InteracProvider {
  async process(params) {
    // Implementation for Interac e-Transfer
    // This would integrate with Canadian bank APIs
    return {
      id: 'etransfer_' + generateId(),
      status: 'pending',
      method: 'interac_etransfer',
      amount: params.amount,
      currency: params.currency,
      reference: this.generateReference()
    };
  }
  
  generateReference() {
    // Generate unique reference for e-transfer
    return 'FIT' + Date.now().toString(36).toUpperCase();
  }
}
```

## Event Architecture with Future Stubs (DECIDED)
**Decision**: Synchronous first with event interface stubs

**Implementation**:
```javascript
// Event bus interface (stubbed for future)
class EventBus {
  constructor() {
    this.syncMode = true; // Start in sync mode
    this.handlers = new Map();
  }
  
  // Register handler (for future use)
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }
  
  // Publish event (currently synchronous)
  async publish(event, data) {
    if (this.syncMode) {
      // In sync mode, just log for audit
      await this.auditLog(event, data);
      return;
    }
    
    // Future: Queue to message broker
    // await this.messageQueue.publish(event, data);
  }
  
  // Audit log for all events
  async auditLog(event, data) {
    await db.query(
      'INSERT INTO event_log (event_type, event_data, created_at) VALUES (?, ?, NOW())',
      [event, JSON.stringify(data)]
    );
  }
  
  // Future migration method
  async enableAsync() {
    this.syncMode = false;
    // Initialize message queue connection
    // this.messageQueue = new MessageQueue();
  }
}

// Usage remains same whether sync or async
const eventBus = new EventBus();

// In appointment service
async function createAppointment(data) {
  // Direct database write (strong consistency)
  const appointment = await db.transaction(async (trx) => {
    const appt = await trx.insert('appointments', data);
    
    // Publish event (currently just logs)
    await eventBus.publish('appointment.created', {
      appointmentId: appt.id,
      trainerId: appt.trainer_id,
      clientId: appt.client_id,
      startTime: appt.start_time
    });
    
    return appt;
  });
  
  // Future handlers would process async
  // - Send confirmation email
  // - Update calendar
  // - Notify trainer app
  
  return appointment;
}
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