const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

class Database {
  async query(text, params) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      logger.error('Database query error', { error, text });
      throw error;
    }
  }

  async beginTransaction() {
    const client = await pool.connect();
    await client.query('BEGIN');
    return client;
  }

  async commitTransaction(client) {
    await client.query('COMMIT');
    client.release();
  }

  async rollbackTransaction(client) {
    await client.query('ROLLBACK');
    client.release();
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
}

module.exports = new Database();