# FitFlow System Architecture

## Overview
FitFlow is designed as a multi-tenant SaaS platform supporting wellness trainers who work across multiple studios. Built using microservices architecture to support multi-studio management and future scalability. The architecture prioritizes security, scalability, and HIPAA compliance.

## High-Level Architecture

### Microservices Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
├─────────────────────┬─────────────────────┬────────────────────┤
│   Trainer Web App   │   Studio Portal     │   Mobile App       │
│   (React/Next.js)   │   (React/Next.js)   │   (React Native)   │
└─────────────────────┴─────────────────────┴────────────────────┘
                                │
                                │ HTTPS/CloudFlare CDN
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               API Gateway (Kong/nginx) - Docker                  │
│                    - Rate Limiting                               │
│                    - SSL Termination                             │
│                    - Load Balancing                              │
│                    - Service Discovery                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
                    ▼           ▼           ▼
┌──────────────────────┬──────────────────┬──────────────────────┐
│   Auth Service       │  User Service    │  Scheduling Service  │
│   - JWT Auth         │  - Trainers      │  - Appointments      │
│   - OAuth2           │  - Clients       │  - Calendar          │
│   - RBAC             │  - Teams         │  - Availability      │
│   [Docker Container] │ [Docker Container]│ [Docker Container]   │
└──────────────────────┴──────────────────┴──────────────────────┘
                    │           │           │
                    ▼           ▼           ▼
┌──────────────────────┬──────────────────┬──────────────────────┐
│  Session Service     │ Financial Service│  Studio Service      │
│  - Notes             │  - Invoicing     │  - Multi-studio      │
│  - Training Plans    │  - Payments      │  - Portal Access     │
│  - AI Summaries      │  - Tax Mgmt      │  - Billing           │
│  [Docker Container]  │ [Docker Container]│ [Docker Container]   │
└──────────────────────┴──────────────────┴──────────────────────┘
                    │           │           │
                    ▼           ▼           ▼
┌──────────────────────┬──────────────────┬──────────────────────┐
│ Notification Service │ Analytics Service│  Storage Service     │
│  - Email             │  - Reports       │  - S3 Interface      │
│  - SMS               │  - BI            │  - Document Mgmt     │
│  - Push              │  - Dashboards    │  - Image Upload      │
│  [Docker Container]  │ [Docker Container]│ [Docker Container]   │
└──────────────────────┴──────────────────┴──────────────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
                    ▼           ▼           ▼
┌──────────────────────┬──────────────────┬──────────────────────┐
│      PostgreSQL      │      Redis       │   OCI Object Store   │
│   - Multi-tenant     │  - Cache         │   - S3 Compatible    │
│   - Encrypted        │  - Queue (Bull)  │   - Documents        │
│   - AWS RDS Compat   │  - Sessions      │   - Backups          │
└──────────────────────┴──────────────────┴──────────────────────┘
```

### Deployment Infrastructure (OCI)
```
┌─────────────────────────────────────────────────────────────────┐
│                    OCI Load Balancer                             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              OCI ARM VM (Ubuntu 22.04 LTS)                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               Docker & Docker Compose                     │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │Gateway  │  │  Auth   │  │  User   │  │Schedule │    │   │
│  │  │Container│  │Container│  │Container│  │Container│... │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture Principles

### 1. SOLID Principles
- **Single Responsibility**: Each microservice handles one business domain
- **Open/Closed**: Services extensible via plugins, closed for modification
- **Liskov Substitution**: Service implementations are interchangeable
- **Interface Segregation**: Minimal, focused service interfaces
- **Dependency Inversion**: All external dependencies use abstractions

### 2. Software Engineering Best Practices
- **DRY** (Don't Repeat Yourself): Shared libraries for common functionality
- **KISS** (Keep It Simple): Simple service boundaries and clear APIs
- **YAGNI** (You Aren't Gonna Need It): Build only what's required
- **Separation of Concerns**: Clear service boundaries
- **12-Factor App**: Environment-based configuration

### 3. Environment Configuration
- **Dev/Test/Prod Environments**: Separate configurations
- **Feature Flags**: Progressive rollout capability
- **Environment Variables**: All secrets and configs
- **CI/CD Pipeline**: GitHub Actions for automated deployment

### 4. Multi-Studio Architecture
- **Studio Hierarchy**: Owners can manage multiple locations
- **Centralized Billing**: Aggregate billing across studios
- **Isolated Data**: Tenant isolation at database level
- **Shared Infrastructure**: Cost-effective resource utilization

## Core Components

### 1. Frontend Applications

#### Trainer Web Application
- **Technology**: Next.js 14 with TypeScript
- **Features**:
  - Dashboard with multi-studio view
  - Calendar/scheduling interface
  - Client management
  - Session notes and planning
  - Financial overview
  - Settings and preferences

#### Studio Portal
- **Technology**: Next.js 14 with TypeScript
- **Features**:
  - Invoice management
  - Payment tracking
  - Trainer management
  - Reporting dashboard
  - Bank account configuration

#### Mobile Application (Future)
- **Technology**: React Native
- **Features**:
  - Quick session logging
  - Schedule viewing
  - Client notes access
  - Basic invoicing

### 2. Backend Services

#### Authentication Service
- JWT-based authentication
- Role-based access control (RBAC)
- Multi-factor authentication support
- Session management
- Password policies compliant with HIPAA

#### Core API Service
- RESTful API design
- GraphQL for complex queries (optional)
- Microservices architecture for scalability
- Event-driven architecture for real-time updates

#### Reporting Service
- PDF invoice generation
- Financial reports
- Tax calculation engine
- Scheduled report delivery

### 3. Data Architecture

#### Primary Database (PostgreSQL)
- Multi-tenant schema with row-level security
- Encrypted at rest and in transit
- Automated backups
- Read replicas for performance

#### Cache Layer (Redis)
- Session storage
- API rate limiting
- Temporary data storage
- Queue management

#### File Storage (AWS S3)
- HIPAA-compliant bucket configuration
- Encrypted storage
- Versioning enabled
- Lifecycle policies for compliance

## Security Architecture

### Data Protection
- **Encryption at Rest**: AES-256 for database and file storage
- **Encryption in Transit**: TLS 1.3 for all communications
- **Key Management**: AWS KMS or HashiCorp Vault

### Access Control
- **Authentication**: JWT with refresh tokens
- **Authorization**: Hierarchical role-based system
  - Super Admin (Platform level)
  - Trainer Admin (Can hire/manage other trainers)
  - Trainer (Individual trainer)
  - Studio Admin (Studio management)
  - Client (Read-only access to their data)
- **API Security**: Rate limiting, API keys, CORS policies
- **Permission Inheritance**: Trainer admins inherit permissions for their team

### HIPAA Compliance
- **Access Logs**: All data access logged
- **Audit Trail**: Immutable audit logs
- **Data Retention**: Configurable retention policies
- **Breach Detection**: Automated monitoring and alerts

## Scalability Design

### Horizontal Scaling
- Stateless API services
- Load balancing with health checks
- Database connection pooling
- Caching strategy

### Performance Optimization
- CDN for static assets
- Database indexing strategy
- Query optimization
- Lazy loading and pagination

## Integration Architecture

### Payment Processing
- Stripe Connect for multi-party payments
- PCI compliance through tokenization
- Webhook handling for payment events

### Email Services
- SendGrid for transactional emails
- Template management
- Bounce handling
- Unsubscribe management

### Tax Services
- Canadian tax API integration
- GST/HST calculation engine
- Provincial tax support
- Automated remittance reports

## Deployment Architecture

### Container Strategy
- Docker containers for all services
- Kubernetes for orchestration
- Health checks and auto-scaling
- Rolling updates

### Environment Management
- Development, Staging, Production
- Infrastructure as Code (Terraform)
- CI/CD pipeline (GitHub Actions)
- Blue-green deployments

## Monitoring and Observability

### Application Monitoring
- Error tracking (Sentry)
- Performance monitoring (New Relic/DataDog)
- Custom metrics and dashboards

### Infrastructure Monitoring
- Server metrics
- Database performance
- API response times
- Resource utilization

### Security Monitoring
- Intrusion detection
- Anomaly detection
- Compliance scanning
- Vulnerability assessments

## Disaster Recovery

### Backup Strategy
- Daily automated backups
- Point-in-time recovery
- Cross-region replication
- Regular restore testing

### Business Continuity
- RTO: 4 hours
- RPO: 1 hour
- Incident response plan
- Communication procedures