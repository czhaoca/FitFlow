# FitFlow - Comprehensive Wellness Professional Management Platform

## Overview
FitFlow is a comprehensive business management platform designed for wellness and fitness trainers who work with multiple studios. It combines scheduling, CRM, accounting, and compliance features into a single integrated solution.

## Core Features

### 👨‍💼 Team Management (Future Roadmap)
- Hire and manage other trainers
- Hierarchical permission system
- Team scheduling coordination
- Revenue sharing calculations
- Performance tracking

### 🗓️ Scheduling & Appointment Management
- Multi-studio appointment scheduling
- Working hours management across different locations
- Class type management (group, individual, trial)
- Automated conflict detection
- Team scheduling for trainer-admins (future roadmap)
- Staff availability management

### 👥 Client Relationship Management (CRM)
- Client roster management
- Session logging and notes
- Client progress tracking
- Personalized training plans
- HIPAA-compliant data storage

### 💰 Financial Management
- Multi-studio billing with different rates
- Automated invoice generation
- Payment tracking and reconciliation
- Canadian GST/tax remittance calculations
- Studio-specific payment schedules

### 📊 Studio Management Portal
- Invoice management dashboard
- Payment tracking (check, EFT, etc.)
- Bank account management
- Studio-specific reporting

### 📝 Session Documentation
- Note-taking journal for each session
- AI-powered session summaries
- Progress tracking
- Plan creation and management

## Technical Stack

### Cloud Infrastructure (OCI Free Tier)
- **Compute**: OCI ARM VM (Ampere A1) - 4 OCPUs, 24GB RAM
- **Database**: MySQL HeatWave 8.0 (cloud-portable, compatible with AWS RDS, Azure, GCP)
- **Object Storage**: OCI Object Storage (S3-compatible APIs)
- **Load Balancer**: OCI Load Balancer with SSL termination

### Core Technologies
- **Backend**: Node.js 20 LTS with Express.js
- **Database**: MySQL HeatWave 8.0
  - Standard MySQL protocol
  - Compatible with mysql2 Node.js driver
  - Cloud-portable SQL syntax
- **Cache/Queue**: Redis 7
  - Bull for job queuing
  - Session storage
  - WebAuthn challenge storage
- **Authentication**: JWT with role-based access control + WebAuthn
- **Payment Processing**: Stripe (with Interac e-Transfer roadmap)
- **Email Service**: Nodemailer (SMTP)
- **SMS Service**: Twilio
- **AI Integration**: OpenAI for session summaries
- **API Gateway**: Kong Gateway
- **Process Manager**: PM2
- **Containerization**: Docker with Docker Compose

## Architecture

### Multi-Tenancy Strategy
- **Shared tables with tenant_id** approach (ADR-001)
- Trainers can work at multiple studios
- Row-Level Security (RLS) for data isolation
- JWT claims include studio access rights
- Automatic tenant filtering in queries

### Microservices
- **auth-service** (Port 3001): Authentication, JWT, WebAuthn
- **payment-service** (Port 3002): Stripe integration, invoicing
- **notification-service** (Port 3003): Email, SMS, daily summaries with AI
- **client-service** (Port 3004): Client management, privacy controls
- **trainer-service** (Port 3005): Trainer management, delegation

### Infrastructure Services
- **MySQL** (Port 3306): Primary database
- **Redis** (Port 6379): Cache and job queue
- **Kong Gateway** (Ports 8000, 8443, 8001): API routing and management

## Project Structure
\`\`\`
FitFlow/
├── docs/                    # Comprehensive documentation
│   ├── architecture/        # ADRs and system design
│   ├── api/                # API documentation
│   ├── database/           # Schema design
│   ├── features/           # Feature specifications
│   └── deployment/         # Deployment guides
├── services/
│   ├── auth/               # Authentication service
│   ├── payment/            # Payment processing
│   ├── notification/       # Notifications & AI summaries
│   ├── client/             # Client management
│   ├── trainer/            # Trainer management
│   └── shared/             # Shared utilities
│       ├── database/       # MySQL adapter
│       ├── middleware/     # Tenant isolation, error handling
│       ├── config/         # Configuration loaders
│       └── utils/          # Logger, helpers
├── config/                 # External configuration templates
├── migrations/             # Database migration scripts
├── scripts/                # Utility scripts
└── docker-compose.yml      # Docker orchestration
\`\`\`

## Getting Started

### Prerequisites
- Node.js 20 LTS
- Docker and Docker Compose
- MySQL 8.0 (or use Docker)
- Redis (or use Docker)

### Quick Start with Docker

\`\`\`bash
# Clone the repository
git clone https://github.com/czhaoca/FitFlow.git
cd FitFlow

# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
\`\`\`

### Manual Setup

\`\`\`bash
# Install dependencies for each service
cd services/auth && npm install
cd ../payment && npm install
cd ../notification && npm install
# ... repeat for other services

# Start MySQL and Redis
docker-compose up -d mysql redis

# Run database migrations
mysql -h localhost -u fitflow -p fitflow < scripts/init-db-mysql.sql

# Start services with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs

# Stop services
pm2 stop all
\`\`\`

### Development

\`\`\`bash
# Run tests
npm test

# Run linter
npm run lint

# Type checking
npm run typecheck
\`\`\`

## Environment Variables

See \`.env.example\` in each service directory for required configuration.

Key variables:
- \`DB_HOST\`, \`DB_PORT\`, \`DB_USER\`, \`DB_PASSWORD\`, \`DB_NAME\` - MySQL connection
- \`REDIS_URL\` - Redis connection string
- \`JWT_SECRET\` - Secret for JWT signing
- \`STRIPE_SECRET_KEY\` - Stripe API key (payment service)
- \`OPENAI_API_KEY\` - OpenAI API key (notification service)
- \`EMAIL_*\` - SMTP configuration
- \`TWILIO_*\` - Twilio SMS configuration

## Security & Compliance
- HIPAA-compliant infrastructure
- End-to-end encryption for sensitive data (field-level encryption)
- Multi-tenancy with strict data isolation
- Role-based access control
- Audit logging for all data access
- Regular security assessments

## Documentation

Comprehensive documentation is available in the \`/docs\` directory:
- **Architecture**: System design, ADRs, cloud portability
- **API**: Endpoint documentation, authentication
- **Database**: Schema design, multi-tenancy strategy
- **Features**: Detailed feature specifications
- **Deployment**: OCI deployment guides, CloudPanel setup
- **Security**: HIPAA compliance, encryption strategies

## Testing

\`\`\`bash
# Run all tests
npm test

# Run tests for specific service
cd services/auth && npm test

# Run tests with coverage
npm test -- --coverage
\`\`\`

## Contributing

Please refer to \`CLAUDE.md\` for development guidelines and architectural decisions.

## License

[License information to be determined]

## Support

For questions or issues:
- Create GitHub issue
- Contact: dev@fitflow.ca
- Documentation: See \`/docs\` directory
