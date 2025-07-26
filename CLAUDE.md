# FitFlow Development Guidelines

## Overview
This document contains critical development guidelines and best practices for FitFlow development. All developers should follow these guidelines to ensure consistency, maintainability, and scalability.

## Technology Stack

### Cloud Infrastructure
- **Primary**: OCI (Oracle Cloud Infrastructure) Free Tier
  - ARM VM with Ubuntu 22.04 LTS
  - OCI Object Storage (S3-compatible)
  - OCI Autonomous Database or PostgreSQL on VM
  - OCI Load Balancer
- **Alternative**: Cloudflare Free Tier
  - Workers for edge computing
  - R2 for object storage (S3-compatible)
  - D1 for SQL database

### Core Technologies
- **Backend**: Node.js with Express.js/Fastify
- **Frontend**: React/Next.js (PWA)
- **Database**: PostgreSQL with AWS RDS-compatible APIs
- **Storage**: S3-compatible APIs (OCI Object Storage / Cloudflare R2)
- **Cache/Queue**: Redis with Bull for job queuing
- **Containerization**: Docker & Docker Compose
- **API Gateway**: Kong or nginx

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
# Development
NODE_ENV=development
API_URL=http://localhost:3000
DB_HOST=localhost

# Test
NODE_ENV=test
API_URL=http://test-api.fitflow.local
DB_HOST=test-db

# Production
NODE_ENV=production
API_URL=https://api.fitflow.ca
DB_HOST=oci-db-prod
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

### Docker Configuration
```dockerfile
# Base image for all services
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Development stage
FROM base AS dev
RUN npm ci
COPY . .
CMD ["npm", "run", "dev"]

# Production stage
FROM base AS production
COPY . .
CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  gateway:
    image: kong:latest
    ports:
      - "8000:8000"
      - "8443:8443"
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /kong/kong.yml
    
  auth-service:
    build: ./services/auth
    environment:
      NODE_ENV: ${NODE_ENV}
      DB_URL: ${DB_URL}
    depends_on:
      - postgres
      - redis
  
  # Additional services...
```

### OCI Deployment
1. **ARM VM Setup**:
   ```bash
   # Install Docker on OCI ARM VM
   sudo apt update
   sudo apt install docker.io docker-compose
   sudo usermod -aG docker $USER
   ```

2. **Deploy Application**:
   ```bash
   # Clone repository
   git clone https://github.com/czhaoca/FitFlow.git
   cd FitFlow
   
   # Set environment variables
   cp .env.example .env.production
   # Edit .env.production with production values
   
   # Deploy with Docker Compose
   docker-compose -f docker-compose.prod.yml up -d
   ```

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

### Database Compatibility
```javascript
// Use standard PostgreSQL clients
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Compatible with OCI Autonomous Database
// Compatible with PostgreSQL on VM
// Compatible with AWS RDS PostgreSQL
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