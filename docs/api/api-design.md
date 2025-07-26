# FitFlow API Design

## Overview
RESTful API design following OpenAPI 3.0 specification with JWT authentication and role-based access control.

## Base URL Structure
```
Production: https://api.fitflow.ca/v1
Staging: https://staging-api.fitflow.ca/v1
Development: http://localhost:3000/v1
```

## Authentication
All API requests require JWT token in Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Common Response Format
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0.0"
  }
}
```

Error Response:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": { ... }
  }
}
```

## API Endpoints

### Authentication Endpoints
```yaml
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
POST   /auth/register
POST   /auth/verify-email
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /auth/me
```

### Trainer Management
```yaml
# Profile Management
GET    /trainers/profile
PUT    /trainers/profile
GET    /trainers/{id}

# Team Management (for trainer admins)
GET    /trainers/team
POST   /trainers/team/invite
PUT    /trainers/team/{id}
DELETE /trainers/team/{id}
GET    /trainers/team/{id}/permissions
PUT    /trainers/team/{id}/permissions

# Studio Relationships
GET    /trainers/studios
POST   /trainers/studios
PUT    /trainers/studios/{id}
DELETE /trainers/studios/{id}
```

### Client Management
```yaml
# CRUD Operations
GET    /clients                  # List with pagination
POST   /clients                  # Create new client
GET    /clients/{id}             # Get client details
PUT    /clients/{id}             # Update client
DELETE /clients/{id}             # Soft delete

# Client Documents
GET    /clients/{id}/documents
POST   /clients/{id}/documents
DELETE /clients/{id}/documents/{docId}

# Client Progress
GET    /clients/{id}/progress
GET    /clients/{id}/measurements
POST   /clients/{id}/measurements

# Permissions (for team access)
GET    /clients/{id}/permissions
POST   /clients/{id}/permissions
DELETE /clients/{id}/permissions/{permissionId}
```

### Scheduling
```yaml
# Calendar Views
GET    /schedule                 # Trainer's schedule
GET    /schedule/team            # Team schedule (admin only)
GET    /schedule/availability    # Available slots

# Appointments
POST   /appointments             # Create appointment
GET    /appointments/{id}        # Get appointment details
PUT    /appointments/{id}        # Update appointment
DELETE /appointments/{id}        # Cancel appointment
POST   /appointments/{id}/complete
POST   /appointments/{id}/no-show

# Recurring Appointments
POST   /appointments/recurring
PUT    /appointments/recurring/{id}
DELETE /appointments/recurring/{id}

# Class Types
GET    /class-types
POST   /class-types
PUT    /class-types/{id}
DELETE /class-types/{id}

# Availability Management
GET    /availability
POST   /availability
PUT    /availability/{id}
DELETE /availability/{id}
```

### Session Documentation
```yaml
# Session Notes
GET    /sessions                # List sessions
GET    /sessions/{id}           # Get session details
POST   /sessions                # Create session note
PUT    /sessions/{id}           # Update session note

# AI Summary
POST   /sessions/{id}/summarize # Generate AI summary

# Training Plans
GET    /training-plans
POST   /training-plans
GET    /training-plans/{id}
PUT    /training-plans/{id}
DELETE /training-plans/{id}
POST   /training-plans/{id}/duplicate
```

### Financial Management
```yaml
# Invoices
GET    /invoices                # List with filters
POST   /invoices                # Create invoice
GET    /invoices/{id}           # Get invoice details
PUT    /invoices/{id}           # Update draft invoice
POST   /invoices/{id}/send      # Send invoice
POST   /invoices/{id}/void      # Void invoice
GET    /invoices/{id}/pdf       # Download PDF

# Bulk Invoice Generation
POST   /invoices/generate-studio-invoices
POST   /invoices/generate-client-invoices

# Payments
GET    /payments                # List payments
POST   /payments                # Record payment
GET    /payments/{id}
PUT    /payments/{id}
POST   /payments/{id}/refund

# Bank Accounts
GET    /bank-accounts
POST   /bank-accounts
PUT    /bank-accounts/{id}
DELETE /bank-accounts/{id}

# Tax Management
GET    /tax/summary             # Tax summary for period
GET    /tax/remittances         # List remittances
POST   /tax/calculate           # Calculate tax owed
POST   /tax/remittances         # Record remittance
GET    /tax/reports/gst         # GST report
```

### Studio Portal
```yaml
# Studio Authentication
POST   /studio/auth/login

# Studio Dashboard
GET    /studio/dashboard
GET    /studio/trainers          # List contracted trainers
GET    /studio/invoices          # List received invoices
GET    /studio/invoices/{id}     # Invoice details
POST   /studio/payments          # Record payment

# Studio Settings
GET    /studio/profile
PUT    /studio/profile
PUT    /studio/payment-terms
PUT    /studio/bank-accounts
```

### Reporting & Analytics
```yaml
# Financial Reports
GET    /reports/revenue          # Revenue by period
GET    /reports/revenue/studio   # Revenue by studio
GET    /reports/revenue/class-type
GET    /reports/tax-summary
GET    /reports/outstanding-invoices

# Client Analytics
GET    /reports/client-retention
GET    /reports/client-progress
GET    /reports/session-history

# Business Analytics
GET    /reports/utilization      # Schedule utilization
GET    /reports/growth           # Business growth metrics
GET    /reports/performance      # Team performance (admin)
```

### System Administration
```yaml
# Audit Logs
GET    /admin/audit-logs
GET    /admin/access-logs

# System Health
GET    /health
GET    /health/detailed         # Admin only

# Configuration
GET    /config/tax-rates
PUT    /config/tax-rates        # Admin only
```

## API Features

### Pagination
```
GET /clients?page=1&limit=20&sort=created_at:desc
```

Response includes:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### Filtering
```
GET /appointments?status=scheduled&date_from=2024-01-01&date_to=2024-01-31
GET /invoices?status=overdue&studio_id=xxx
```

### Field Selection
```
GET /clients?fields=id,first_name,last_name,email
```

### Search
```
GET /clients?search=john
GET /appointments?q=yoga
```

### Batch Operations
```yaml
POST   /clients/batch            # Create multiple
PUT    /clients/batch            # Update multiple
DELETE /clients/batch            # Delete multiple
```

### Webhooks
```yaml
POST   /webhooks                 # Register webhook
GET    /webhooks                 # List webhooks
PUT    /webhooks/{id}            # Update webhook
DELETE /webhooks/{id}            # Remove webhook
GET    /webhooks/{id}/logs       # View webhook logs
```

## Rate Limiting
- 1000 requests per hour for authenticated users
- 100 requests per hour for unauthenticated endpoints
- Burst limit: 20 requests per second

Headers returned:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1642339200
```

## API Versioning
- Version in URL path: `/v1/`, `/v2/`
- Sunset headers for deprecated endpoints
- Minimum 6-month deprecation notice

## Error Codes
```
400 - Bad Request
401 - Unauthorized
403 - Forbidden
404 - Not Found
409 - Conflict
422 - Validation Error
429 - Too Many Requests
500 - Internal Server Error
503 - Service Unavailable
```

## CORS Policy
```javascript
{
  origin: [
    'https://app.fitflow.ca',
    'https://studio.fitflow.ca'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}
```