# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2025-07-26] - Initial Architecture Setup

### Added
- Initial project setup with comprehensive documentation structure
- API design document with RESTful endpoints and OpenAPI specification
- System architecture documentation with microservices design
- Database schema design with multi-tenancy and HIPAA compliance
- HIPAA compliance documentation and guidelines
- Future roadmap documentation
- CLAUDE.md with development guidelines and best practices
- Docker and docker-compose configurations for development and production
- Environment configuration templates (.env.example)
- Git commit message conventions following Conventional Commits
- Changelog tracking system for development iterations

### Changed
- Updated architecture to use OCI (Oracle Cloud Infrastructure) Free Tier as primary platform
- Added Cloudflare Free Tier as alternative deployment option
- Implemented microservices architecture for scalability
- Added multi-studio ownership support in database schema
- Configured all services to use S3-compatible APIs (OCI Object Storage/Cloudflare R2)
- Set up environment-based configuration (dev/test/prod)

### Technical Decisions
- **Cloud Platform**: OCI Free Tier (primary) / Cloudflare Free Tier (alternative)
- **Architecture**: Microservices with Docker containerization
- **Database**: PostgreSQL with AWS RDS-compatible APIs
- **Storage**: S3-compatible object storage
- **Message Queue**: Redis with Bull
- **Deployment**: OCI ARM VM with Ubuntu and Docker
- **Development Principles**: SOLID, DRY, KISS, YAGNI

### Commits
- `d7bae5b` - Initial project setup with documentation
- `ce06b18` - Update architecture for OCI/Cloudflare deployment with microservices

### Conversation Context
- Session focused on setting up initial project architecture
- Emphasized cloud-agnostic design with AWS-compatible APIs
- Prioritized free tier services for cost optimization
- Implemented best practices for scalability and maintainability

## [2025-07-26] - Stripe Payment Integration and Client CRM

### Added
- **Stripe Payment Integration Service**
  - Complete payment microservice with Stripe API integration
  - Support for one-time payments and recurring subscriptions
  - Payment methods management (save, list, delete cards)
  - Refund processing capabilities
  - Webhook handling for payment events
  - Package-based payment system for class bundles
  - Canadian tax support (GST/PST/HST)

- **Client Authentication Service**
  - Client registration and login system
  - Email verification workflow
  - Password reset functionality
  - Two-factor authentication (2FA) with QR codes
  - JWT-based authentication with refresh tokens
  - Session management with Redis
  - Rate limiting for security

- **Enhanced Database Schema**
  - Client accounts with login capability (clients table linked to users)
  - Multi-trainer, multi-studio relationship tracking (client_trainers table)
  - Client-visible notes separate from trainer's private notes
  - Payment packages and subscription management tables
  - Stripe payment tracking and history
  - Client payment methods storage
  - Database views for client portal and trainer panels
  - Enhanced RLS policies for client data access

### Changed
- Updated clients table to support user accounts and Stripe customer IDs
- Modified appointment_participants table for package-based payments
- Enhanced Row-Level Security (RLS) policies to support client access
- Added new relationship tables for complex trainer-client-studio associations

### Technical Implementation
- **Payment Service**: Node.js/Express with Stripe SDK
- **Auth Service**: Node.js/Express with JWT, bcrypt, and Redis
- **Email Service**: Nodemailer with SMTP support
- **Security**: Helmet, CORS, rate limiting, input validation with Joi
- **Database**: PostgreSQL with encrypted PII/PHI fields
- **Caching**: Redis for session management and temporary tokens

### Project Structure
```
services/
├── auth/
│   ├── controllers/
│   ├── services/
│   ├── routes/
│   ├── middleware/
│   └── utils/
├── payment/
│   ├── controllers/
│   ├── services/
│   ├── routes/
│   ├── middleware/
│   └── utils/
```

### Conversation Context
- Session focused on implementing Stripe payment integration and client CRM
- Designed to support complex multi-studio, multi-trainer relationships
- Implemented separate notes systems for trainers (private) and clients (visible)
- Created comprehensive authentication system with modern security features

## [2025-07-26] - Enhanced Security and Privacy Features

### Added
- **Polymorphic Person Entity**
  - Created persons table as base entity for trainers and clients
  - Enables code reuse and consistent data structure
  - Supports future extension for other user types

- **WebAuthn/Passkey Support**
  - Complete passkey authentication implementation
  - Support for platform authenticators (Face ID, Touch ID, Windows Hello)
  - Multiple passkey management per user
  - Passwordless login capability
  - Device management and naming

- **Notification Service**
  - Email and SMS notification support
  - Daily summary emails for trainers with next day's schedule
  - AI-powered summaries using OpenAI integration
  - Appointment reminders with customizable timing
  - Client progress insights and recommendations
  - Notification preferences and scheduling
  - Queue-based processing with Bull and Redis

- **Privacy Controls & Session Sharing**
  - Master privacy toggle for clients to control data sharing
  - Granular controls for session notes, trainer notes, and progress sharing
  - Trainer can mark sessions as shareable
  - Client consent required for cross-trainer visibility
  - Separate trainer internal notes from client-visible notes
  - Full session history access for studio managers/owners only

- **Manager Delegation System**
  - Temporary delegation of manager powers
  - No further delegation allowed (prevents delegation chains)
  - Time-bound delegations with automatic expiry
  - Full or limited permission delegation
  - Audit trail for all delegations
  - Automatic notifications for delegation changes

### Changed
- Updated database schema with new tables:
  - webauthn_credentials for passkey storage
  - persons table for polymorphic user base
  - notification_preferences and notification_queue
  - manager_delegations for delegation tracking
  - trainer_daily_summaries for AI summaries
- Enhanced session_notes table with sharing controls
- Added privacy settings to clients table
- Updated trainer_studios roles to include manager role

### Technical Implementation
- **WebAuthn**: SimpleWebAuthn library for FIDO2 compliance
- **Notifications**: Nodemailer (email), Twilio (SMS), Bull (queuing)
- **AI Summaries**: OpenAI GPT-3.5 for intelligent insights
- **Privacy**: Row-level security policies with complex access rules
- **Cron Jobs**: Automated scheduling for daily summaries and reminders

### Security Enhancements
- Passkey support reduces password-related vulnerabilities
- Client-controlled privacy settings ensure data protection
- Delegation system prevents unauthorized access escalation
- Comprehensive audit logging for all privacy-related actions

### Conversation Context
- Enhanced security with passkey/MFA for both trainers and clients
- Implemented client privacy controls respecting user consent
- Created notification system with AI-powered trainer summaries
- Added manager delegation with strict no-further-delegation policy

## [2025-07-27] - OCI Infrastructure and Architecture Review

### Added
- **OCI Free Tier Infrastructure Configuration**
  - OCI Autonomous Database (20GB) integration with PostgreSQL compatibility
  - OCI Object Storage with S3-compatible APIs
  - CloudPanel deployment configuration for OCI ARM VM
  - PostgreSQL to Oracle migration scripts and compatibility adapter
  - PM2 ecosystem configuration for microservices clustering
  - Comprehensive OCI deployment guide

- **Financial Projections & Business Model**
  - Detailed revenue model with SaaS subscription tiers
  - Cost structure analysis (fixed and variable costs)
  - 3-year financial projections with growth scenarios
  - Break-even analysis and unit economics
  - Sensitivity analysis for key business metrics
  - Studio operating cost context

- **Trial Client Intake & Waiver System**
  - Comprehensive trial intake questionnaire system
  - Digital waiver management with e-signatures
  - Multiple waiver templates (standard, minor, high-risk, medical)
  - Trial package configuration and management
  - Conversion tracking and analytics
  - Automated follow-up campaigns
  - PIPEDA and HIPAA compliant data handling

- **Architectural Review Documentation**
  - Critical issues identified: multi-tenancy, Oracle compatibility, security
  - Scalability analysis with growth projections
  - Cost optimization strategies
  - Compliance gaps (HIPAA, PIPEDA)
  - Immediate action items with priority matrix
  - Decision framework for technology choices

### Changed
- Updated technology stack to use OCI Free Tier services
- Modified database adapter to support both PostgreSQL and Oracle
- Enhanced CLAUDE.md with OCI-specific configurations
- Updated system architecture documentation with OCI infrastructure

### Technical Decisions
- **Database**: PostgreSQL on VM recommended over Oracle ATP for compatibility
- **Multi-tenancy**: Schema-based approach for studio isolation
- **Security**: Field-level encryption for PHI/PII, HashiCorp Vault for keys
- **API Gateway**: Kong recommended for service mesh
- **Monitoring**: Self-hosted ELK stack and Prometheus/Grafana
- **CDN**: Cloudflare for performance and cost optimization

### Financial Projections Summary
- **Year 1**: $115K revenue, 190 customers, break-even month 8
- **Year 2**: $580K revenue, 700+ customers, 47.8% net margin
- **Year 3**: $2.4M revenue, 2000 customers, 60% net margin
- **Trial System ROI**: 300% in 6 months, 20% increase in new clients

### Commits
- `7e9ed63` - feat(infrastructure): integrate OCI free tier with CloudPanel deployment
- `9c2f815` - docs(architecture): add comprehensive architectural review discussion document

### Conversation Context
- Transitioned infrastructure to OCI Free Tier for cost optimization
- Conducted thorough architectural review identifying critical improvements
- Added financial projections showing path to profitability
- Designed trial intake and waiver systems for improved conversion

## [2025-07-27] - External Configuration System

### Added
- **External Pricing Configuration System**
  - Comprehensive pricing configuration template with all pricing options
  - Configuration loader with validation and hot-reload capability
  - Pricing service using external configuration
  - API endpoints for public and private pricing access
  - Secure configuration management (excluded from git)
  - Detailed documentation for configuration usage

- **Feature-Based Configuration System**
  - Feature flags to enable/disable entire feature categories
  - Hierarchical feature control (categories → sub-features → settings)
  - Automatic filtering of pricing based on enabled features
  - Business rules configuration (booking windows, hours, etc.)
  - Regional settings (currency, language, date format)
  - Feature dependency validation

- **Conditional Configuration Examples**
  - Dynamic pricing page generation based on features
  - Feature-aware discount calculations
  - Payment method filtering
  - Business rule validation
  - API response adaptation

### Changed
- Updated .gitignore to exclude actual configuration files
- Modified pricing loader to respect feature flags
- Enhanced configuration manager with feature checking
- All pricing values now externalized from code

### Technical Implementation
- **Configuration Structure**:
  - `features.config.json` - Controls enabled/disabled features
  - `pricing.config.json` - Contains pricing for all features
  - Automatic filtering based on feature enablement
  - Template files provided for both configurations

- **Key Benefits**:
  - No code changes required for pricing updates
  - Studios can enable only needed features
  - Reduced configuration complexity
  - Environment-specific configurations
  - Hot-reload capability for changes

### Use Cases Supported
- **Simple Studio**: Minimal features (drop-in only)
- **Premium Studio**: All features enabled
- **Yoga Studio**: Workshops focus, no memberships
- **Personal Trainer**: Individual sessions only
- **Multi-location**: Enterprise features

### Commits
- `a124c42` - feat(config): implement external pricing configuration system
- `52ca0ac` - feat(config): add feature-based configuration system

### Conversation Context
- Created external configuration system for all pricing-related values
- Implemented feature flags to control available functionality
- Designed system to automatically adapt to different studio types
- Ensured security by excluding sensitive pricing data from repository