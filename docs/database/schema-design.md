# FitFlow Database Schema Design

## Overview
The database is designed with multi-tenancy, HIPAA compliance, and future scalability in mind. We use PostgreSQL with row-level security and encryption at rest. The schema is compatible with OCI Autonomous Database and standard PostgreSQL deployments with AWS RDS-compatible APIs.

## Core Design Principles
1. **Multi-tenancy**: Trainer-based isolation with shared studios
2. **Multi-Studio Support**: Owners can manage multiple studio locations
3. **Audit Trail**: All changes tracked with timestamps and user IDs
4. **Soft Deletes**: Data marked as deleted, not physically removed
5. **HIPAA Compliance**: Encrypted PII and PHI fields
6. **Extensibility**: JSONB fields for flexible metadata
7. **Cloud Compatibility**: AWS RDS-compatible, no vendor-specific features
8. **OCI Optimization**: Designed for OCI Autonomous Database performance

## Schema Diagrams

### User Management Schema
```sql
-- Users table (base for all user types)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255) NOT NULL,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active', -- active, suspended, deleted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::JSONB
);

-- Trainers table (extends users)
CREATE TABLE trainers (
    id UUID PRIMARY KEY REFERENCES users(id),
    parent_trainer_id UUID REFERENCES trainers(id), -- For hierarchy
    business_name VARCHAR(255),
    license_number VARCHAR(100),
    specializations TEXT[],
    bio TEXT,
    hourly_rate DECIMAL(10, 2),
    commission_rate DECIMAL(5, 2), -- For trainer admins
    bank_account_info JSONB, -- Encrypted
    tax_info JSONB, -- Encrypted, includes GST number
    settings JSONB DEFAULT '{}'::JSONB
);

-- Studios table (supports multi-location ownership)
CREATE TABLE studios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_studio_id UUID REFERENCES studios(id), -- For chain/franchise support
    owner_id UUID REFERENCES users(id), -- Studio owner account
    name VARCHAR(255) NOT NULL,
    business_number VARCHAR(100),
    address JSONB NOT NULL, -- {street, city, province, postal_code, country}
    contact_info JSONB, -- {phone, email, website}
    payment_terms JSONB, -- {frequency, net_days, preferred_method}
    tax_rates JSONB, -- {gst, pst, hst}
    bank_account_info JSONB, -- Encrypted
    settings JSONB DEFAULT '{}'::JSONB,
    is_headquarters BOOLEAN DEFAULT FALSE,
    billing_consolidated BOOLEAN DEFAULT TRUE, -- For multi-location billing
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trainer-Studio relationships
CREATE TABLE trainer_studios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    studio_id UUID NOT NULL REFERENCES studios(id),
    role VARCHAR(50) DEFAULT 'contractor', -- contractor, employee
    commission_rate DECIMAL(5, 2),
    class_rates JSONB, -- {group: 50, individual: 100, trial: 25}
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trainer_id, studio_id)
);
```

### Client Management Schema
```sql
-- Clients table (HIPAA compliant, with login capability)
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id), -- Link to users table for login
    first_name VARCHAR(100) NOT NULL, -- Encrypted
    last_name VARCHAR(100) NOT NULL, -- Encrypted
    email VARCHAR(255) UNIQUE, -- Encrypted, unique for login
    phone VARCHAR(50), -- Encrypted
    date_of_birth DATE, -- Encrypted
    emergency_contact JSONB, -- Encrypted
    medical_info JSONB, -- Encrypted, {conditions, medications, allergies}
    goals TEXT, -- Encrypted
    preferences JSONB,
    source VARCHAR(100), -- referral, walk-in, online
    stripe_customer_id VARCHAR(255), -- Stripe customer ID
    default_payment_method_id VARCHAR(255), -- Stripe payment method
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    INDEX idx_client_email (email)
);

-- Client-Trainer relationships (clients can work with multiple trainers)
CREATE TABLE client_trainers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    studio_id UUID REFERENCES studios(id), -- Where they usually meet
    relationship_type VARCHAR(50) DEFAULT 'active', -- active, past, prospective
    first_session_date DATE,
    last_session_date DATE,
    total_sessions INTEGER DEFAULT 0,
    preferred_trainer BOOLEAN DEFAULT FALSE,
    notes TEXT, -- Trainer's private notes about client
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, trainer_id)
);

-- Client notes visible to client (different from trainer's private notes)
CREATE TABLE client_visible_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    appointment_id UUID REFERENCES appointments(id),
    note_type VARCHAR(50) DEFAULT 'general', -- general, progress, recommendation
    content TEXT NOT NULL, -- Encrypted
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_client_visible_notes (client_id, created_at DESC)
);

-- Client access permissions (for team management)
CREATE TABLE client_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    permission_level VARCHAR(50) DEFAULT 'read', -- read, write, admin
    granted_by UUID NOT NULL REFERENCES trainers(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, trainer_id)
);
```

### Scheduling Schema
```sql
-- Class types definition
CREATE TABLE class_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50), -- group, individual, trial
    duration_minutes INTEGER NOT NULL,
    max_participants INTEGER DEFAULT 1,
    default_rate DECIMAL(10, 2),
    description TEXT,
    color VARCHAR(7), -- Hex color for calendar
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Appointments/Sessions
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    studio_id UUID REFERENCES studios(id),
    class_type_id UUID NOT NULL REFERENCES class_types(id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, completed, cancelled, no-show
    location_type VARCHAR(50) DEFAULT 'studio', -- studio, online, client-location
    location_details JSONB,
    rate DECIMAL(10, 2),
    notes TEXT, -- Encrypted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    INDEX idx_trainer_schedule (trainer_id, start_time),
    INDEX idx_studio_schedule (studio_id, start_time)
);

-- Appointment participants
CREATE TABLE appointment_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    status VARCHAR(50) DEFAULT 'confirmed', -- confirmed, waitlisted, cancelled
    attended BOOLEAN,
    payment_status VARCHAR(50) DEFAULT 'pending', -- pending, paid, refunded, package_used
    payment_id UUID REFERENCES payments(id), -- Direct payment reference
    client_package_id UUID REFERENCES client_packages(id), -- Package used for payment
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(appointment_id, client_id)
);

-- Trainer availability
CREATE TABLE trainer_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    studio_id UUID REFERENCES studios(id),
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    effective_from DATE NOT NULL,
    effective_until DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_trainer_availability (trainer_id, day_of_week)
);
```

### Session Documentation Schema
```sql
-- Session notes and documentation
CREATE TABLE session_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    session_date DATE NOT NULL,
    subjective TEXT, -- Encrypted - What client reported
    objective TEXT, -- Encrypted - What trainer observed
    assessment TEXT, -- Encrypted - Trainer's assessment
    plan TEXT, -- Encrypted - Future plan
    exercises JSONB, -- Encrypted - {name, sets, reps, weight, notes}
    measurements JSONB, -- Encrypted - {weight, body_fat, measurements}
    private_notes TEXT, -- Encrypted - Not shared with client
    ai_summary TEXT, -- Encrypted - AI-generated summary
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_client_notes (client_id, session_date DESC)
);

-- Training plans
CREATE TABLE training_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    name VARCHAR(255) NOT NULL,
    goal TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    frequency_per_week INTEGER,
    plan_details JSONB, -- Encrypted - Structured workout plan
    progress_metrics JSONB, -- Encrypted - How to measure progress
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Financial Schema
```sql
-- Invoices
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    studio_id UUID REFERENCES studios(id),
    client_id UUID REFERENCES clients(id), -- Null for studio invoices
    invoice_type VARCHAR(50) NOT NULL, -- studio, client
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    tax_details JSONB NOT NULL, -- {gst: 0.05, pst: 0.07, amounts: {...}}
    total DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft', -- draft, sent, paid, overdue, cancelled
    sent_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_trainer_invoices (trainer_id, invoice_date DESC),
    INDEX idx_studio_invoices (studio_id, invoice_date DESC)
);

-- Invoice line items
CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    appointment_id UUID REFERENCES appointments(id),
    description TEXT NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    tax_rate DECIMAL(5, 4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id),
    appointment_id UUID REFERENCES appointments(id), -- Direct payment for appointment
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    studio_id UUID REFERENCES studios(id),
    client_id UUID REFERENCES clients(id),
    amount DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(50) NOT NULL, -- cheque, e-transfer, cash, credit, stripe
    stripe_payment_intent_id VARCHAR(255), -- Stripe payment intent ID
    stripe_charge_id VARCHAR(255), -- Stripe charge ID
    stripe_refund_id VARCHAR(255), -- Stripe refund ID if refunded
    reference_number VARCHAR(255),
    bank_account_id UUID, -- References bank_accounts table
    status VARCHAR(50) DEFAULT 'completed', -- completed, pending, failed, refunded
    refund_amount DECIMAL(10, 2),
    refund_reason TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_stripe_payment_intent (stripe_payment_intent_id)
);

-- Stripe payment methods stored for clients
CREATE TABLE client_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    stripe_payment_method_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- card, bank_account
    brand VARCHAR(50), -- visa, mastercard, amex, etc
    last4 VARCHAR(4), -- Last 4 digits
    exp_month INTEGER,
    exp_year INTEGER,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, stripe_payment_method_id)
);

-- Payment packages/memberships
CREATE TABLE payment_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    studio_id UUID REFERENCES studios(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    package_type VARCHAR(50) NOT NULL, -- single_session, multi_session, monthly_unlimited
    sessions_count INTEGER, -- Number of sessions (null for unlimited)
    validity_days INTEGER NOT NULL, -- How long the package is valid
    price DECIMAL(10, 2) NOT NULL,
    stripe_price_id VARCHAR(255), -- For recurring subscriptions
    is_recurring BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Client package purchases
CREATE TABLE client_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    package_id UUID NOT NULL REFERENCES payment_packages(id),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    payment_id UUID REFERENCES payments(id),
    stripe_subscription_id VARCHAR(255), -- For recurring packages
    purchase_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    sessions_used INTEGER DEFAULT 0,
    sessions_remaining INTEGER,
    status VARCHAR(50) DEFAULT 'active', -- active, expired, cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_client_active_packages (client_id, status, expiry_date)
);

-- Bank accounts
CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    account_name VARCHAR(255) NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(50), -- Encrypted
    transit_number VARCHAR(50), -- Encrypted
    institution_number VARCHAR(50), -- Encrypted
    account_type VARCHAR(50), -- checking, savings
    currency VARCHAR(3) DEFAULT 'CAD',
    is_primary BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tax remittances
CREATE TABLE tax_remittances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainers(id),
    tax_type VARCHAR(50) NOT NULL, -- gst, hst, pst
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    gross_revenue DECIMAL(10, 2) NOT NULL,
    taxable_revenue DECIMAL(10, 2) NOT NULL,
    tax_collected DECIMAL(10, 2) NOT NULL,
    input_tax_credits DECIMAL(10, 2) DEFAULT 0,
    net_tax_owing DECIMAL(10, 2) NOT NULL,
    remittance_date DATE,
    remittance_reference VARCHAR(255),
    status VARCHAR(50) DEFAULT 'calculated', -- calculated, filed, paid
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Audit and Security Schema
```sql
-- Audit log for all data changes
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL, -- create, read, update, delete
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_audit_user (user_id, created_at DESC),
    INDEX idx_audit_record (table_name, record_id, created_at DESC)
);

-- Access logs for HIPAA compliance
CREATE TABLE access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    resource_type VARCHAR(100) NOT NULL, -- client_data, financial_data, etc.
    resource_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL, -- view, export, print
    purpose VARCHAR(255), -- treatment, payment, operations
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    INDEX idx_access_user (user_id, created_at DESC),
    INDEX idx_access_resource (resource_type, resource_id, created_at DESC)
);
```

## Database Features

### Row Level Security (RLS)
```sql
-- Enable RLS on sensitive tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Example RLS policy for clients
CREATE POLICY client_access ON clients
    FOR ALL
    USING (
        -- Client can see their own data
        user_id = current_user_id()
        -- Trainers who have worked with the client
        OR EXISTS (
            SELECT 1 FROM client_trainers 
            WHERE client_id = clients.id 
            AND trainer_id = current_user_id()
        )
        -- Trainers with explicit permissions
        OR EXISTS (
            SELECT 1 FROM client_permissions 
            WHERE client_id = clients.id 
            AND trainer_id = current_user_id()
        )
        -- Parent trainers can see sub-trainer clients
        OR EXISTS (
            SELECT 1 FROM trainers t1
            JOIN client_trainers ct ON ct.trainer_id = t1.id
            WHERE ct.client_id = clients.id
            AND t1.parent_trainer_id = current_user_id()
        )
    );

-- RLS policy for client visible notes
CREATE POLICY client_notes_access ON client_visible_notes
    FOR ALL
    USING (
        -- Clients can see their own notes
        client_id IN (SELECT id FROM clients WHERE user_id = current_user_id())
        -- Trainers can manage notes they created
        OR trainer_id = current_user_id()
    );

-- RLS policy for appointments - clients can see their appointments
CREATE POLICY client_appointment_access ON appointments
    FOR SELECT
    USING (
        -- Trainers see their appointments
        trainer_id = current_user_id()
        -- Clients see appointments they're participating in
        OR EXISTS (
            SELECT 1 FROM appointment_participants ap
            JOIN clients c ON ap.client_id = c.id
            WHERE ap.appointment_id = appointments.id
            AND c.user_id = current_user_id()
        )
    );
```

### Encryption
- All PII/PHI fields encrypted using pgcrypto
- Encryption keys managed via AWS KMS or HashiCorp Vault
- Transparent encryption for application layer

### Indexes Strategy
- Primary keys: UUID with B-tree index
- Foreign keys: Automatic B-tree index
- Time-based queries: B-tree on timestamp columns
- Search queries: GiST/GIN indexes on JSONB fields
- Full-text search: tsvector with GIN index

### Partitioning Strategy
- Audit logs partitioned by month
- Appointments partitioned by year
- Old partitions archived to cold storage

## Database Views for CRM

### Client Portal Views
```sql
-- Client session history view
CREATE VIEW client_session_history AS
SELECT 
    a.id as appointment_id,
    a.start_time,
    a.end_time,
    a.status,
    ct.name as class_type,
    t.business_name as trainer_name,
    t.id as trainer_id,
    s.name as studio_name,
    ap.attended,
    ap.payment_status,
    cvn.content as visible_notes,
    cvn.note_type
FROM appointments a
JOIN appointment_participants ap ON a.id = ap.appointment_id
JOIN class_types ct ON a.class_type_id = ct.id
JOIN trainers t ON a.trainer_id = t.id
LEFT JOIN studios s ON a.studio_id = s.id
LEFT JOIN client_visible_notes cvn ON cvn.appointment_id = a.id
WHERE ap.client_id = current_client_id();

-- Client payment history view
CREATE VIEW client_payment_history AS
SELECT 
    p.id as payment_id,
    p.payment_date,
    p.amount,
    p.payment_method,
    p.status,
    a.start_time as session_date,
    t.business_name as trainer_name,
    s.name as studio_name,
    pkg.name as package_name
FROM payments p
LEFT JOIN appointments a ON p.appointment_id = a.id
LEFT JOIN trainers t ON p.trainer_id = t.id
LEFT JOIN studios s ON p.studio_id = s.id
LEFT JOIN client_packages cp ON p.id = cp.payment_id
LEFT JOIN payment_packages pkg ON cp.package_id = pkg.id
WHERE p.client_id = current_client_id()
ORDER BY p.payment_date DESC;

-- Client active packages view
CREATE VIEW client_active_packages_view AS
SELECT 
    cp.id,
    pkg.name,
    pkg.description,
    cp.sessions_remaining,
    cp.expiry_date,
    cp.status,
    t.business_name as trainer_name,
    s.name as studio_name
FROM client_packages cp
JOIN payment_packages pkg ON cp.package_id = pkg.id
JOIN trainers t ON cp.trainer_id = t.id
LEFT JOIN studios s ON pkg.studio_id = s.id
WHERE cp.client_id = current_client_id()
AND cp.status = 'active'
AND cp.expiry_date >= CURRENT_DATE;
```

### Trainer Panel Views
```sql
-- Trainer client roster view
CREATE VIEW trainer_client_roster AS
SELECT 
    c.id as client_id,
    c.first_name,
    c.last_name,
    c.email,
    ct.relationship_type,
    ct.first_session_date,
    ct.last_session_date,
    ct.total_sessions,
    ct.preferred_trainer,
    ct.studio_id,
    s.name as primary_studio,
    COUNT(DISTINCT ap.appointment_id) as total_appointments,
    MAX(a.start_time) as last_appointment
FROM client_trainers ct
JOIN clients c ON ct.client_id = c.id
LEFT JOIN studios s ON ct.studio_id = s.id
LEFT JOIN appointment_participants ap ON ap.client_id = c.id
LEFT JOIN appointments a ON ap.appointment_id = a.id AND a.trainer_id = ct.trainer_id
WHERE ct.trainer_id = current_trainer_id()
GROUP BY c.id, c.first_name, c.last_name, c.email, ct.relationship_type, 
         ct.first_session_date, ct.last_session_date, ct.total_sessions, 
         ct.preferred_trainer, ct.studio_id, s.name;

-- Trainer revenue by client view
CREATE VIEW trainer_client_revenue AS
SELECT 
    c.id as client_id,
    c.first_name || ' ' || c.last_name as client_name,
    COUNT(DISTINCT p.id) as payment_count,
    SUM(p.amount) as total_revenue,
    AVG(p.amount) as avg_payment,
    MAX(p.payment_date) as last_payment_date,
    STRING_AGG(DISTINCT s.name, ', ') as studios
FROM payments p
JOIN clients c ON p.client_id = c.id
LEFT JOIN studios s ON p.studio_id = s.id
WHERE p.trainer_id = current_trainer_id()
AND p.status = 'completed'
GROUP BY c.id, c.first_name, c.last_name
ORDER BY total_revenue DESC;
```

## Migration Strategy
1. Schema versioning with migration tools (Flyway/Liquibase)
2. Zero-downtime migrations using shadow tables
3. Rollback procedures for each migration
4. Data validation after each migration