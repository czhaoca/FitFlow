const { adapter } = require('../../shared/database/mysql-adapter');
const logger = require('./logger');
const redisClient = require('./redis');

class Database {
  constructor() {
    this.adapter = adapter;
  }

  async initialize() {
    await this.adapter.initialize();
  }

  async query(text, params) {
    const start = Date.now();
    try {
      // Convert PostgreSQL syntax to MySQL using adapter
      const mysqlQuery = this.adapter.convertPostgreSQLToMySQL(text);
      const res = await this.adapter.query(mysqlQuery, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text: mysqlQuery, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      logger.error('Database query error', { error, text });
      throw error;
    }
  }

  async beginTransaction() {
    const connection = await this.adapter.beginTransaction();
    return connection;
  }

  async commitTransaction(connection) {
    await this.adapter.commit(connection);
  }

  async rollbackTransaction(connection) {
    await this.adapter.rollback(connection);
  }

  // User operations
  async getUserByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await this.query(query, [email]);
    return result.rows[0];
  }

  async getUserById(userId) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.query(query, [userId]);
    return result.rows[0];
  }

  async createUser({ email, passwordHash, role = 'client' }) {
    const query = `
      INSERT INTO users (email, password_hash, status, created_at)
      VALUES ($1, $2, 'active', NOW())
      RETURNING id, email, status, created_at
    `;
    const result = await this.query(query, [email, passwordHash]);
    return result.rows[0];
  }

  async verifyUserEmail(userId) {
    const query = 'UPDATE users SET email_verified = true WHERE id = $1';
    await this.query(query, [userId]);
  }

  async updateUserPassword(userId, passwordHash) {
    const query = 'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2';
    await this.query(query, [passwordHash, userId]);
  }

  async updateUserLastLogin(userId) {
    const query = 'UPDATE users SET last_login_at = NOW() WHERE id = $1';
    await this.query(query, [userId]);
  }

  async enableUserTwoFactor(userId, secret) {
    const query = 'UPDATE users SET mfa_enabled = true, mfa_secret = $1 WHERE id = $2';
    await this.query(query, [secret, userId]);
  }

  async enableWebAuthn(userId) {
    const query = 'UPDATE users SET webauthn_enabled = true WHERE id = $1';
    await this.query(query, [userId]);
  }

  // Client operations
  async getClientByUserId(userId) {
    const query = 'SELECT * FROM clients WHERE user_id = $1';
    const result = await this.query(query, [userId]);
    return result.rows[0];
  }

  async getClientById(clientId) {
    const query = 'SELECT * FROM clients WHERE id = $1';
    const result = await this.query(query, [clientId]);
    return result.rows[0];
  }

  async createClient(clientData) {
    const query = `
      INSERT INTO clients (
        user_id, first_name, last_name, email, phone,
        date_of_birth, emergency_contact, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, user_id, first_name, last_name, email
    `;
    
    const values = [
      clientData.userId,
      clientData.firstName,
      clientData.lastName,
      clientData.email,
      clientData.phone,
      clientData.dateOfBirth,
      JSON.stringify(clientData.emergencyContact)
    ];
    
    const result = await this.query(query, values);
    return result.rows[0];
  }

  async updateClientProfile(clientId, updates) {
    const allowedFields = ['first_name', 'last_name', 'phone', 'date_of_birth', 'emergency_contact', 'goals', 'preferences'];
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (updateFields.length === 0) {
      return null;
    }

    values.push(clientId);
    const query = `
      UPDATE clients 
      SET ${updateFields.join(', ')}, updated_at = NOW() 
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.query(query, values);
    return result.rows[0];
  }

  // Client-Trainer relationships
  async getClientTrainers(clientId) {
    const query = `
      SELECT ct.*, t.business_name, t.email as trainer_email
      FROM client_trainers ct
      JOIN trainers t ON ct.trainer_id = t.id
      WHERE ct.client_id = $1
      ORDER BY ct.preferred_trainer DESC, ct.last_session_date DESC
    `;
    const result = await this.query(query, [clientId]);
    return result.rows;
  }

  async createClientTrainerRelationship(clientId, trainerId, studioId) {
    const query = `
      INSERT INTO client_trainers (
        client_id, trainer_id, studio_id, relationship_type,
        first_session_date, created_at
      ) VALUES ($1, $2, $3, 'active', CURRENT_DATE, NOW())
      ON CONFLICT (client_id, trainer_id) 
      DO UPDATE SET 
        last_session_date = CURRENT_DATE,
        total_sessions = client_trainers.total_sessions + 1
      RETURNING *
    `;
    
    const result = await this.query(query, [clientId, trainerId, studioId]);
    return result.rows[0];
  }

  // WebAuthn operations
  async getUserWebAuthnCredentials(userId) {
    const query = 'SELECT * FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await this.query(query, [userId]);
    return result.rows;
  }

  async getWebAuthnCredential(credentialId) {
    const query = 'SELECT * FROM webauthn_credentials WHERE credential_id = $1';
    const result = await this.query(query, [credentialId]);
    return result.rows[0];
  }

  async saveWebAuthnCredential(data) {
    const query = `
      INSERT INTO webauthn_credentials (
        user_id, credential_id, public_key, counter,
        aaguid, transports, device_name, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `;
    
    const values = [
      data.userId,
      data.credentialId,
      data.publicKey,
      data.counter,
      data.aaguid,
      data.transports,
      data.deviceName
    ];
    
    const result = await this.query(query, values);
    return result.rows[0].id;
  }

  async updateWebAuthnCredential(credentialId, updates, userId = null) {
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (updates.counter !== undefined) {
      updateFields.push(`counter = $${paramCount}`);
      values.push(updates.counter);
      paramCount++;
    }

    if (updates.lastUsedAt !== undefined) {
      updateFields.push(`last_used_at = $${paramCount}`);
      values.push(updates.lastUsedAt);
      paramCount++;
    }

    if (updates.deviceName !== undefined) {
      updateFields.push(`device_name = $${paramCount}`);
      values.push(updates.deviceName);
      paramCount++;
    }

    values.push(credentialId);
    let query = `UPDATE webauthn_credentials SET ${updateFields.join(', ')} WHERE credential_id = $${paramCount}`;
    
    if (userId) {
      paramCount++;
      values.push(userId);
      query += ` AND user_id = $${paramCount}`;
    }

    await this.query(query, values);
  }

  async deleteWebAuthnCredential(userId, credentialId) {
    const query = 'DELETE FROM webauthn_credentials WHERE user_id = $1 AND id = $2';
    await this.query(query, [userId, credentialId]);
  }

  async storeWebAuthnChallenge(key, challenge, type) {
    const redisKey = `webauthn:${type}:${key}`;
    await redisClient.setex(redisKey, 300, challenge); // 5 minutes expiry
  }

  async getWebAuthnChallenge(key, type) {
    const redisKey = `webauthn:${type}:${key}`;
    return await redisClient.get(redisKey);
  }

  async clearWebAuthnChallenge(key, type) {
    const redisKey = `webauthn:${type}:${key}`;
    await redisClient.del(redisKey);
  }

  // Person operations
  async getPersonByUserId(userId) {
    const query = 'SELECT * FROM persons WHERE user_id = $1';
    const result = await this.query(query, [userId]);
    return result.rows[0];
  }
}

module.exports = new Database();