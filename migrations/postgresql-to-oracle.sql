-- FitFlow Database Migration: PostgreSQL to Oracle
-- For OCI Autonomous Database

-- Enable DBMS_CRYPTO for encryption
GRANT EXECUTE ON DBMS_CRYPTO TO FITFLOW_APP;

-- Create UUID generation function
CREATE OR REPLACE FUNCTION generate_uuid RETURN RAW IS
  v_uuid RAW(16);
BEGIN
  v_uuid := SYS_GUID();
  RETURN v_uuid;
END generate_uuid;
/

-- Create helper function for PostgreSQL NOW()
CREATE OR REPLACE FUNCTION now_timestamp RETURN TIMESTAMP WITH TIME ZONE IS
BEGIN
  RETURN SYSTIMESTAMP;
END now_timestamp;
/

-- Users table
CREATE TABLE users (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    email VARCHAR2(255) UNIQUE NOT NULL,
    email_verified NUMBER(1) DEFAULT 0 CHECK (email_verified IN (0, 1)),
    password_hash VARCHAR2(255),
    mfa_enabled NUMBER(1) DEFAULT 0 CHECK (mfa_enabled IN (0, 1)),
    mfa_secret VARCHAR2(255),
    webauthn_enabled NUMBER(1) DEFAULT 0 CHECK (webauthn_enabled IN (0, 1)),
    status VARCHAR2(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    metadata CLOB DEFAULT '{}' CONSTRAINT users_metadata_json CHECK (metadata IS JSON)
);

-- WebAuthn credentials
CREATE TABLE webauthn_credentials (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    user_id RAW(16) NOT NULL REFERENCES users(id),
    credential_id VARCHAR2(1000) UNIQUE NOT NULL,
    public_key CLOB NOT NULL,
    counter NUMBER DEFAULT 0,
    aaguid VARCHAR2(255),
    transports CLOB CONSTRAINT webauthn_transports_json CHECK (transports IS JSON),
    device_name VARCHAR2(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_webauthn_user ON webauthn_credentials(user_id);

-- Persons table (polymorphic base)
CREATE TABLE persons (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    user_id RAW(16) UNIQUE REFERENCES users(id),
    person_type VARCHAR2(50) NOT NULL,
    first_name VARCHAR2(100) NOT NULL,
    last_name VARCHAR2(100) NOT NULL,
    email VARCHAR2(255) NOT NULL,
    phone VARCHAR2(50),
    date_of_birth DATE,
    emergency_contact CLOB CONSTRAINT persons_emergency_json CHECK (emergency_contact IS JSON),
    profile_photo_url VARCHAR2(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
);
CREATE INDEX idx_person_type ON persons(person_type);
CREATE INDEX idx_person_user ON persons(user_id);

-- Trainers table
CREATE TABLE trainers (
    id RAW(16) PRIMARY KEY REFERENCES persons(id),
    parent_trainer_id RAW(16) REFERENCES trainers(id),
    business_name VARCHAR2(255),
    license_number VARCHAR2(100),
    specializations CLOB CONSTRAINT trainers_specializations_json CHECK (specializations IS JSON),
    bio CLOB,
    hourly_rate NUMBER(10, 2),
    commission_rate NUMBER(5, 2),
    bank_account_info CLOB CONSTRAINT trainers_bank_json CHECK (bank_account_info IS JSON),
    tax_info CLOB CONSTRAINT trainers_tax_json CHECK (tax_info IS JSON),
    can_view_shared_notes NUMBER(1) DEFAULT 1 CHECK (can_view_shared_notes IN (0, 1)),
    settings CLOB DEFAULT '{}' CONSTRAINT trainers_settings_json CHECK (settings IS JSON)
);

-- Studios table
CREATE TABLE studios (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    parent_studio_id RAW(16) REFERENCES studios(id),
    owner_id RAW(16) REFERENCES users(id),
    name VARCHAR2(255) NOT NULL,
    business_number VARCHAR2(100),
    address CLOB NOT NULL CONSTRAINT studios_address_json CHECK (address IS JSON),
    contact_info CLOB CONSTRAINT studios_contact_json CHECK (contact_info IS JSON),
    payment_terms CLOB CONSTRAINT studios_payment_json CHECK (payment_terms IS JSON),
    tax_rates CLOB CONSTRAINT studios_tax_json CHECK (tax_rates IS JSON),
    bank_account_info CLOB CONSTRAINT studios_bank_json CHECK (bank_account_info IS JSON),
    settings CLOB DEFAULT '{}' CONSTRAINT studios_settings_json CHECK (settings IS JSON),
    is_headquarters NUMBER(1) DEFAULT 0 CHECK (is_headquarters IN (0, 1)),
    billing_consolidated NUMBER(1) DEFAULT 1 CHECK (billing_consolidated IN (0, 1)),
    status VARCHAR2(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
);

-- Trainer-Studio relationships
CREATE TABLE trainer_studios (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    trainer_id RAW(16) NOT NULL REFERENCES trainers(id),
    studio_id RAW(16) NOT NULL REFERENCES studios(id),
    role VARCHAR2(50) DEFAULT 'contractor',
    commission_rate NUMBER(5, 2),
    class_rates CLOB CONSTRAINT trainer_studios_rates_json CHECK (class_rates IS JSON),
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR2(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    CONSTRAINT uk_trainer_studio UNIQUE(trainer_id, studio_id)
);

-- Manager delegations
CREATE TABLE manager_delegations (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    studio_id RAW(16) NOT NULL REFERENCES studios(id),
    delegator_id RAW(16) NOT NULL REFERENCES trainers(id),
    delegate_id RAW(16) NOT NULL REFERENCES trainers(id),
    delegation_type VARCHAR2(50) NOT NULL,
    permissions CLOB CONSTRAINT delegations_perms_json CHECK (permissions IS JSON),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active NUMBER(1) DEFAULT 1 CHECK (is_active IN (0, 1)),
    can_further_delegate NUMBER(1) DEFAULT 0 CHECK (can_further_delegate = 0),
    reason CLOB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    created_by RAW(16) NOT NULL REFERENCES trainers(id),
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by RAW(16) REFERENCES trainers(id),
    CONSTRAINT uk_studio_delegate_date UNIQUE(studio_id, delegate_id, start_date),
    CONSTRAINT chk_end_after_start CHECK (end_date > start_date)
);

-- Clients table
CREATE TABLE clients (
    id RAW(16) PRIMARY KEY REFERENCES persons(id),
    medical_info CLOB CONSTRAINT clients_medical_json CHECK (medical_info IS JSON),
    goals CLOB,
    preferences CLOB CONSTRAINT clients_prefs_json CHECK (preferences IS JSON),
    source VARCHAR2(100),
    stripe_customer_id VARCHAR2(255),
    default_payment_method_id VARCHAR2(255),
    allow_session_sharing NUMBER(1) DEFAULT 1 CHECK (allow_session_sharing IN (0, 1)),
    allow_trainer_notes_sharing NUMBER(1) DEFAULT 1 CHECK (allow_trainer_notes_sharing IN (0, 1)),
    allow_progress_sharing NUMBER(1) DEFAULT 1 CHECK (allow_progress_sharing IN (0, 1)),
    status VARCHAR2(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Client-Trainer relationships
CREATE TABLE client_trainers (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    client_id RAW(16) NOT NULL REFERENCES clients(id),
    trainer_id RAW(16) NOT NULL REFERENCES trainers(id),
    studio_id RAW(16) REFERENCES studios(id),
    relationship_type VARCHAR2(50) DEFAULT 'active',
    first_session_date DATE,
    last_session_date DATE,
    total_sessions NUMBER DEFAULT 0,
    preferred_trainer NUMBER(1) DEFAULT 0 CHECK (preferred_trainer IN (0, 1)),
    notes CLOB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    CONSTRAINT uk_client_trainer UNIQUE(client_id, trainer_id)
);

-- Client visible notes
CREATE TABLE client_visible_notes (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    client_id RAW(16) NOT NULL REFERENCES clients(id),
    trainer_id RAW(16) NOT NULL REFERENCES trainers(id),
    appointment_id RAW(16),
    note_type VARCHAR2(50) DEFAULT 'general',
    content CLOB NOT NULL,
    is_pinned NUMBER(1) DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
);
CREATE INDEX idx_client_visible_notes ON client_visible_notes(client_id, created_at DESC);

-- Class types
CREATE TABLE class_types (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    trainer_id RAW(16) NOT NULL REFERENCES trainers(id),
    name VARCHAR2(100) NOT NULL,
    category VARCHAR2(50),
    duration_minutes NUMBER NOT NULL,
    max_participants NUMBER DEFAULT 1,
    default_rate NUMBER(10, 2),
    description CLOB,
    color VARCHAR2(7),
    status VARCHAR2(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
);

-- Appointments
CREATE TABLE appointments (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    trainer_id RAW(16) NOT NULL REFERENCES trainers(id),
    studio_id RAW(16) REFERENCES studios(id),
    class_type_id RAW(16) NOT NULL REFERENCES class_types(id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR2(50) DEFAULT 'scheduled',
    location_type VARCHAR2(50) DEFAULT 'studio',
    location_details CLOB CONSTRAINT appointments_location_json CHECK (location_details IS JSON),
    rate NUMBER(10, 2),
    notes CLOB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason CLOB
);
CREATE INDEX idx_trainer_schedule ON appointments(trainer_id, start_time);
CREATE INDEX idx_studio_schedule ON appointments(studio_id, start_time);

-- Session notes
CREATE TABLE session_notes (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    appointment_id RAW(16) NOT NULL REFERENCES appointments(id),
    trainer_id RAW(16) NOT NULL REFERENCES trainers(id),
    client_id RAW(16) NOT NULL REFERENCES clients(id),
    session_date DATE NOT NULL,
    subjective CLOB,
    objective CLOB,
    assessment CLOB,
    plan CLOB,
    exercises CLOB CONSTRAINT session_exercises_json CHECK (exercises IS JSON),
    measurements CLOB CONSTRAINT session_measurements_json CHECK (measurements IS JSON),
    private_notes CLOB,
    trainer_internal_notes CLOB,
    ai_summary CLOB,
    is_shareable_with_trainers NUMBER(1) DEFAULT 1 CHECK (is_shareable_with_trainers IN (0, 1)),
    shared_by_trainer NUMBER(1) DEFAULT 0 CHECK (shared_by_trainer IN (0, 1)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
);
CREATE INDEX idx_client_notes ON session_notes(client_id, session_date DESC);

-- Notification preferences
CREATE TABLE notification_preferences (
    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
    user_id RAW(16) NOT NULL REFERENCES users(id),
    notification_type VARCHAR2(100) NOT NULL,
    channel VARCHAR2(50) NOT NULL,
    enabled NUMBER(1) DEFAULT 1 CHECK (enabled IN (0, 1)),
    schedule CLOB CONSTRAINT notif_schedule_json CHECK (schedule IS JSON),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    CONSTRAINT uk_user_notif_channel UNIQUE(user_id, notification_type, channel)
);

-- Create sequences for numeric IDs where needed
CREATE SEQUENCE invoice_number_seq START WITH 1000;

-- Create triggers for updated_at timestamps
CREATE OR REPLACE TRIGGER users_update_timestamp
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

CREATE OR REPLACE TRIGGER persons_update_timestamp
BEFORE UPDATE ON persons
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSTIMESTAMP;
END;
/

-- Create views for compatibility
CREATE OR REPLACE VIEW v_client_session_history AS
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
LEFT JOIN client_visible_notes cvn ON cvn.appointment_id = a.id;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA TO FITFLOW_APP;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA TO FITFLOW_APP;