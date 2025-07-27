-- FitFlow Database Migration: PostgreSQL to MySQL
-- Compatible with MySQL 8.0+ and MySQL HeatWave

-- Create database
CREATE DATABASE IF NOT EXISTS fitflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fitflow;

-- Enable event scheduler for automated tasks
SET GLOBAL event_scheduler = ON;

-- Users table
CREATE TABLE users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    webauthn_enabled BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    last_login_at TIMESTAMP NULL,
    metadata JSON DEFAULT ('{}'),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_deleted (deleted_at)
) ENGINE=InnoDB;

-- WebAuthn credentials
CREATE TABLE webauthn_credentials (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    credential_id TEXT NOT NULL,
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    aaguid VARCHAR(255),
    transports JSON,
    device_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    INDEX idx_user (user_id),
    UNIQUE KEY uk_credential_id (credential_id(255)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Persons table (polymorphic base)
CREATE TABLE persons (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) UNIQUE,
    person_type VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    date_of_birth DATE,
    emergency_contact JSON,
    profile_photo_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_person_type (person_type),
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Trainers table
CREATE TABLE trainers (
    id CHAR(36) PRIMARY KEY,
    parent_trainer_id CHAR(36),
    business_name VARCHAR(255),
    license_number VARCHAR(100),
    specializations JSON,
    bio TEXT,
    hourly_rate DECIMAL(10, 2),
    commission_rate DECIMAL(5, 2),
    bank_account_info JSON, -- Encrypted
    tax_info JSON, -- Encrypted
    can_view_shared_notes BOOLEAN DEFAULT TRUE,
    settings JSON DEFAULT ('{}'),
    FOREIGN KEY (id) REFERENCES persons(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_trainer_id) REFERENCES trainers(id) ON DELETE SET NULL,
    INDEX idx_parent_trainer (parent_trainer_id)
) ENGINE=InnoDB;

-- Studios table
CREATE TABLE studios (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    parent_studio_id CHAR(36),
    owner_id CHAR(36),
    name VARCHAR(255) NOT NULL,
    business_number VARCHAR(100),
    address JSON NOT NULL,
    contact_info JSON,
    payment_terms JSON,
    tax_rates JSON,
    bank_account_info JSON, -- Encrypted
    settings JSON DEFAULT ('{}'),
    is_headquarters BOOLEAN DEFAULT FALSE,
    billing_consolidated BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_studio_id) REFERENCES studios(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_owner (owner_id),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Trainer-Studio relationships
CREATE TABLE trainer_studios (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    trainer_id CHAR(36) NOT NULL,
    studio_id CHAR(36) NOT NULL,
    role VARCHAR(50) DEFAULT 'contractor',
    commission_rate DECIMAL(5, 2),
    class_rates JSON,
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_trainer_studio (trainer_id, studio_id),
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE,
    FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    INDEX idx_studio (studio_id),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Manager delegations
CREATE TABLE manager_delegations (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    studio_id CHAR(36) NOT NULL,
    delegator_id CHAR(36) NOT NULL,
    delegate_id CHAR(36) NOT NULL,
    delegation_type VARCHAR(50) NOT NULL,
    permissions JSON,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    can_further_delegate BOOLEAN DEFAULT FALSE CHECK (can_further_delegate = FALSE),
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by CHAR(36) NOT NULL,
    revoked_at TIMESTAMP NULL,
    revoked_by CHAR(36),
    UNIQUE KEY uk_studio_delegate_date (studio_id, delegate_id, start_date),
    CONSTRAINT chk_end_after_start CHECK (end_date > start_date),
    FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    FOREIGN KEY (delegator_id) REFERENCES trainers(id) ON DELETE CASCADE,
    FOREIGN KEY (delegate_id) REFERENCES trainers(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES trainers(id),
    FOREIGN KEY (revoked_by) REFERENCES trainers(id),
    INDEX idx_delegate (delegate_id),
    INDEX idx_active (is_active, start_date, end_date)
) ENGINE=InnoDB;

-- Clients table
CREATE TABLE clients (
    id CHAR(36) PRIMARY KEY,
    medical_info JSON, -- Encrypted
    goals TEXT, -- Encrypted
    preferences JSON,
    source VARCHAR(100),
    stripe_customer_id VARCHAR(255),
    default_payment_method_id VARCHAR(255),
    allow_session_sharing BOOLEAN DEFAULT TRUE,
    allow_trainer_notes_sharing BOOLEAN DEFAULT TRUE,
    allow_progress_sharing BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (id) REFERENCES persons(id) ON DELETE CASCADE,
    INDEX idx_stripe_customer (stripe_customer_id),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Client-Trainer relationships
CREATE TABLE client_trainers (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36) NOT NULL,
    trainer_id CHAR(36) NOT NULL,
    studio_id CHAR(36),
    relationship_type VARCHAR(50) DEFAULT 'active',
    first_session_date DATE,
    last_session_date DATE,
    total_sessions INT DEFAULT 0,
    preferred_trainer BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_client_trainer (client_id, trainer_id),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE,
    FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL,
    INDEX idx_trainer (trainer_id),
    INDEX idx_relationship (relationship_type)
) ENGINE=InnoDB;

-- Client visible notes
CREATE TABLE client_visible_notes (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    client_id CHAR(36) NOT NULL,
    trainer_id CHAR(36) NOT NULL,
    appointment_id CHAR(36),
    note_type VARCHAR(50) DEFAULT 'general',
    content TEXT NOT NULL, -- Encrypted
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE,
    INDEX idx_client_notes (client_id, created_at DESC)
) ENGINE=InnoDB;

-- Class types
CREATE TABLE class_types (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    trainer_id CHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    duration_minutes INT NOT NULL,
    max_participants INT DEFAULT 1,
    default_rate DECIMAL(10, 2),
    description TEXT,
    color VARCHAR(7),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE,
    INDEX idx_trainer (trainer_id),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Appointments
CREATE TABLE appointments (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    trainer_id CHAR(36) NOT NULL,
    studio_id CHAR(36),
    class_type_id CHAR(36) NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled',
    location_type VARCHAR(50) DEFAULT 'studio',
    location_details JSON,
    rate DECIMAL(10, 2),
    notes TEXT, -- Encrypted
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP NULL,
    cancellation_reason TEXT,
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE,
    FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL,
    FOREIGN KEY (class_type_id) REFERENCES class_types(id),
    INDEX idx_trainer_schedule (trainer_id, start_time),
    INDEX idx_studio_schedule (studio_id, start_time),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Session notes
CREATE TABLE session_notes (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    appointment_id CHAR(36) NOT NULL,
    trainer_id CHAR(36) NOT NULL,
    client_id CHAR(36) NOT NULL,
    session_date DATE NOT NULL,
    subjective TEXT, -- Encrypted
    objective TEXT, -- Encrypted
    assessment TEXT, -- Encrypted
    plan TEXT, -- Encrypted
    exercises JSON, -- Encrypted
    measurements JSON, -- Encrypted
    private_notes TEXT, -- Encrypted
    trainer_internal_notes TEXT, -- Encrypted
    ai_summary TEXT, -- Encrypted
    is_shareable_with_trainers BOOLEAN DEFAULT TRUE,
    shared_by_trainer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_client_notes (client_id, session_date DESC),
    INDEX idx_appointment (appointment_id)
) ENGINE=InnoDB;

-- Notification preferences
CREATE TABLE notification_preferences (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    notification_type VARCHAR(100) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    schedule JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_notif_channel (user_id, notification_type, channel),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- Payment-related tables
CREATE TABLE payments (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    invoice_id CHAR(36),
    appointment_id CHAR(36),
    trainer_id CHAR(36) NOT NULL,
    studio_id CHAR(36),
    client_id CHAR(36),
    amount DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    stripe_payment_intent_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    stripe_refund_id VARCHAR(255),
    reference_number VARCHAR(255),
    status VARCHAR(50) DEFAULT 'completed',
    refund_amount DECIMAL(10, 2),
    refund_reason TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trainer_id) REFERENCES trainers(id),
    FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    INDEX idx_stripe_payment_intent (stripe_payment_intent_id),
    INDEX idx_payment_date (payment_date),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Create views for compatibility
CREATE OR REPLACE VIEW client_session_history AS
SELECT 
    a.id as appointment_id,
    a.start_time,
    a.end_time,
    a.status,
    ct.name as class_type,
    CONCAT(p.first_name, ' ', p.last_name) as trainer_name,
    t.id as trainer_id,
    s.name as studio_name,
    cvn.content as visible_notes,
    cvn.note_type
FROM appointments a
JOIN class_types ct ON a.class_type_id = ct.id
JOIN trainers t ON a.trainer_id = t.id
JOIN persons p ON t.id = p.id
LEFT JOIN studios s ON a.studio_id = s.id
LEFT JOIN client_visible_notes cvn ON cvn.appointment_id = a.id;

-- Create stored procedures for complex operations
DELIMITER $$

-- Procedure to handle UUID generation for tables without default UUID
CREATE PROCEDURE generate_uuid_if_null(INOUT id CHAR(36))
BEGIN
    IF id IS NULL THEN
        SET id = UUID();
    END IF;
END$$

-- Function to calculate next invoice number
CREATE FUNCTION get_next_invoice_number()
RETURNS VARCHAR(50)
DETERMINISTIC
BEGIN
    DECLARE next_num INT;
    SELECT IFNULL(MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)), 999) + 1
    INTO next_num
    FROM invoices
    WHERE invoice_number REGEXP '^INV-[0-9]{4}-[0-9]+$';
    RETURN CONCAT('INV-', YEAR(CURDATE()), '-', LPAD(next_num, 6, '0'));
END$$

DELIMITER ;

-- Create indexes for performance
CREATE INDEX idx_appointments_date_range ON appointments(start_time, end_time);
CREATE INDEX idx_payments_client_date ON payments(client_id, payment_date);
CREATE INDEX idx_session_notes_sharing ON session_notes(is_shareable_with_trainers, shared_by_trainer);

-- Create events for automated tasks
DELIMITER $$

-- Event to mark expired manager delegations
CREATE EVENT IF NOT EXISTS expire_manager_delegations
ON SCHEDULE EVERY 1 HOUR
DO
BEGIN
    UPDATE manager_delegations 
    SET is_active = FALSE 
    WHERE is_active = TRUE 
    AND end_date < NOW();
END$$

-- Event to clean up old deleted records
CREATE EVENT IF NOT EXISTS cleanup_soft_deleted
ON SCHEDULE EVERY 1 DAY
STARTS TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY)
DO
BEGIN
    -- Delete users marked as deleted more than 90 days ago
    DELETE FROM users 
    WHERE deleted_at IS NOT NULL 
    AND deleted_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
END$$

DELIMITER ;

-- Grant permissions for application user
-- Note: Run these with appropriate admin privileges
-- GRANT SELECT, INSERT, UPDATE, DELETE ON fitflow.* TO 'fitflow_app'@'%';
-- GRANT EXECUTE ON fitflow.* TO 'fitflow_app'@'%';
-- FLUSH PRIVILEGES;