# ADR-003: Field-Level Encryption Strategy

## Status
Accepted

## Context
FitFlow handles sensitive data including:
- Personal Health Information (PHI) - medical conditions, medications, allergies
- Financial data - bank account information, payment details
- Personal Identifiable Information (PII) - addresses, phone numbers

Current state has basic database-level encryption but no field-level protection, creating compliance risks for HIPAA and privacy regulations.

## Decision
We will implement **Application-Level Field Encryption** for all sensitive data fields.

## Rationale

### Options Considered

1. **Field-Level Encryption** ✅ **SELECTED**
   - Application manages encryption/decryption
   - No additional infrastructure required
   - Fine-grained control over sensitive fields

2. **Vault Integration (HashiCorp/OCI Vault)**
   - Centralized key management
   - Additional vendor dependency
   - OCI Vault not available in free tier

3. **Transparent Data Encryption + Application Encryption**
   - Defense in depth approach
   - More complex implementation
   - Higher performance overhead

### Key Decision Factors

1. **No Additional Vendors**: Avoids introducing HashiCorp Vault as another dependency.

2. **OCI Free Tier Compatibility**: OCI Vault is not available in the free tier, making it unsuitable for initial deployment.

3. **Simplicity**: Application-level encryption is straightforward to implement and maintain.

4. **Sufficient Security**: Meets HIPAA requirements when implemented with proper key management.

5. **Performance**: Minimal impact as searching within encrypted fields is not required.

## Consequences

### Positive
- No additional infrastructure costs
- Complete control over encryption implementation
- Easy to audit which fields are encrypted
- Can selectively decrypt based on user permissions
- Portable across cloud providers

### Negative
- Key management complexity in application
- Cannot search within encrypted fields
- Slight performance overhead for encryption/decryption
- Need to carefully manage key rotation

## Implementation Details

### Encryption Service
```javascript
const crypto = require('crypto');

class FieldEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyDerivationIterations = 100000;
  }

  // Derive unique key for each field
  deriveKey(masterKey, salt) {
    return crypto.pbkdf2Sync(
      masterKey, 
      salt, 
      this.keyDerivationIterations, 
      32, 
      'sha256'
    );
  }

  encryptField(data, fieldName) {
    const salt = crypto.randomBytes(16);
    const key = this.deriveKey(process.env.MASTER_KEY, salt);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      ciphertext: encrypted,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
      algorithm: this.algorithm,
      fieldName: fieldName,
      version: 1 // For future key rotation
    };
  }

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
```

### Database Schema
```sql
-- Store encrypted data as JSON
CREATE TABLE clients (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  -- Encrypted fields stored as JSON
  medical_info JSON,
  financial_info JSON,
  -- Check constraint ensures valid encryption format
  CONSTRAINT chk_medical_encrypted 
    CHECK (JSON_VALID(medical_info) AND 
           JSON_CONTAINS_PATH(medical_info, 'one', 
           '$.ciphertext', '$.salt', '$.iv', '$.authTag')),
  INDEX idx_tenant_email (tenant_id, email)
);
```

### Usage Pattern
```javascript
// Service layer handles encryption transparently
class ClientService {
  constructor() {
    this.encryption = new FieldEncryption();
  }

  async createClient(data) {
    const client = {
      ...data,
      medical_info: data.medical_info ? 
        this.encryption.encryptField(data.medical_info, 'medical_info') : null,
      financial_info: data.financial_info ?
        this.encryption.encryptField(data.financial_info, 'financial_info') : null
    };
    
    return await db.insert('clients', client);
  }

  async getClient(id, includeProtected = false) {
    const client = await db.findById('clients', id);
    
    if (includeProtected && client.medical_info) {
      client.medical_info = this.encryption.decryptField(client.medical_info);
    } else {
      // Remove encrypted fields if not authorized
      delete client.medical_info;
      delete client.financial_info;
    }
    
    return client;
  }
}
```

### Key Management Strategy

1. **Master Key Storage**:
   - Development: Environment variable
   - Production: OCI Secrets Service (when available) or secure environment injection

2. **Key Rotation Schedule**:
   - Data Encryption Keys: Derived per field with unique salt (no rotation needed)
   - Master Key: Annual rotation with versioning support

3. **Key Versioning**:
   ```javascript
   // Support multiple key versions during rotation
   const keyVersions = {
     1: process.env.MASTER_KEY_V1,
     2: process.env.MASTER_KEY_V2 // During rotation
   };
   ```

4. **Access Control**:
   - Only specific service accounts can access master key
   - Audit all decryption operations
   - Implement role-based field access

### Fields to Encrypt

| Data Type | Fields | Encryption Required |
|-----------|--------|-------------------|
| Medical | conditions, medications, allergies, notes | Yes |
| Financial | bank_account, routing_number, credit_card | Yes |
| PII | ssn, sin, driver_license | Yes |
| General | name, email, phone | No (searchable) |

## Security Considerations

1. **Key Exposure**: Master key must never be logged or transmitted
2. **Memory Security**: Clear decrypted data from memory after use
3. **Audit Trail**: Log all encryption/decryption operations
4. **Error Handling**: Never expose encryption errors to users
5. **Backup Security**: Encrypted backups must remain encrypted

## Migration Plan

1. **Phase 1**: Implement encryption service
2. **Phase 2**: Update schemas for encrypted fields  
3. **Phase 3**: Migrate existing data with encryption
4. **Phase 4**: Update all services to use encryption
5. **Phase 5**: Audit and verify encryption coverage

## References
- [NIST Cryptographic Standards](https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- Original discussion: `/work/FitFlow/docs/architecture/architectural-review-discussion.md`