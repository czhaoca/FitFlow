const { adapter } = require('../../shared/database/mysql-adapter');
const logger = require('./logger');

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

  // Notification preferences
  async getNotificationPreferences(userId) {
    const query = `
      SELECT * FROM notification_preferences 
      WHERE user_id = $1 
      ORDER BY notification_type, channel
    `;
    const result = await this.query(query, [userId]);
    return result.rows;
  }

  async updateNotificationPreference(data) {
    const query = `
      INSERT INTO notification_preferences (
        user_id, notification_type, channel, enabled, schedule
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, notification_type, channel)
      DO UPDATE SET 
        enabled = EXCLUDED.enabled,
        schedule = EXCLUDED.schedule,
        updated_at = NOW()
    `;
    
    const values = [
      data.userId,
      data.notificationType,
      data.channel,
      data.enabled,
      JSON.stringify(data.schedule || {})
    ];
    
    await this.query(query, values);
  }

  // Notification queue
  async createNotification(data) {
    const query = `
      INSERT INTO notification_queue (
        user_id, notification_type, channel, recipient,
        subject, content, metadata, scheduled_for, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;
    
    const values = [
      data.userId,
      data.notificationType,
      data.channel,
      data.recipient,
      data.subject,
      data.content,
      JSON.stringify(data.metadata || {}),
      data.scheduledFor || new Date(),
      data.status || 'pending'
    ];
    
    const result = await this.query(query, values);
    return result.rows[0].id;
  }

  async updateNotificationStatus(notificationId, status, metadata = {}) {
    const query = `
      UPDATE notification_queue 
      SET status = $1, sent_at = $2, metadata = metadata || $3
      WHERE id = $4
    `;
    
    const values = [
      status,
      status === 'sent' ? new Date() : null,
      JSON.stringify(metadata),
      notificationId
    ];
    
    await this.query(query, values);
  }

  async getNotificationHistory(userId, options = {}) {
    let query = `
      SELECT * FROM notification_queue 
      WHERE user_id = $1
    `;
    
    const values = [userId];
    let paramCount = 2;
    
    if (options.status) {
      query += ` AND status = $${paramCount}`;
      values.push(options.status);
      paramCount++;
    }
    
    query += ` ORDER BY created_at DESC`;
    
    if (options.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(options.limit);
      paramCount++;
    }
    
    if (options.offset) {
      query += ` OFFSET $${paramCount}`;
      values.push(options.offset);
    }
    
    const result = await this.query(query, values);
    return result.rows;
  }

  // Trainer operations
  async getTrainerById(trainerId) {
    const query = `
      SELECT t.*, p.* 
      FROM trainers t
      JOIN persons p ON t.id = p.id
      WHERE t.id = $1
    `;
    const result = await this.query(query, [trainerId]);
    return result.rows[0];
  }

  async getTrainersWithDailySummary() {
    const query = `
      SELECT DISTINCT t.*, p.user_id
      FROM trainers t
      JOIN persons p ON t.id = p.id
      JOIN notification_preferences np ON p.user_id = np.user_id
      WHERE np.notification_type = 'daily_summary'
      AND np.enabled = true
    `;
    const result = await this.query(query);
    return result.rows;
  }

  async getTrainerAppointments(trainerId, date) {
    const query = `
      SELECT 
        a.*,
        ct.name as class_type,
        s.name as studio_name,
        json_agg(
          json_build_object(
            'client_id', c.id,
            'client_name', p.first_name || ' ' || p.last_name,
            'attended', ap.attended
          )
        ) as participants
      FROM appointments a
      JOIN class_types ct ON a.class_type_id = ct.id
      LEFT JOIN studios s ON a.studio_id = s.id
      LEFT JOIN appointment_participants ap ON a.id = ap.appointment_id
      LEFT JOIN clients c ON ap.client_id = c.id
      LEFT JOIN persons p ON c.id = p.id
      WHERE a.trainer_id = $1
      AND DATE(a.start_time) = DATE($2)
      AND a.status != 'cancelled'
      GROUP BY a.id, ct.name, s.name
      ORDER BY a.start_time
    `;
    
    const result = await this.query(query, [trainerId, date]);
    return result.rows;
  }

  // Client operations
  async getClientById(clientId) {
    const query = `
      SELECT c.*, p.*
      FROM clients c
      JOIN persons p ON c.id = p.id
      WHERE c.id = $1
    `;
    const result = await this.query(query, [clientId]);
    return result.rows[0];
  }

  async getRecentSessionNotes(clientId, limit = 3) {
    const query = `
      SELECT sn.*, t.business_name as trainer_name
      FROM session_notes sn
      JOIN trainers t ON sn.trainer_id = t.id
      WHERE sn.client_id = $1
      ORDER BY sn.session_date DESC
      LIMIT $2
    `;
    const result = await this.query(query, [clientId, limit]);
    return result.rows;
  }

  // Daily summaries
  async createTrainerDailySummary(data) {
    const query = `
      INSERT INTO trainer_daily_summaries (
        trainer_id, summary_date, appointments,
        client_notes, ai_insights, sent_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (trainer_id, summary_date)
      DO UPDATE SET 
        appointments = EXCLUDED.appointments,
        client_notes = EXCLUDED.client_notes,
        ai_insights = EXCLUDED.ai_insights,
        sent_at = NOW()
    `;
    
    const values = [
      data.trainerId,
      data.summaryDate,
      JSON.stringify(data.appointments),
      JSON.stringify(data.clientNotes || {}),
      data.aiInsights
    ];
    
    await this.query(query, values);
  }

  // Appointment operations
  async getAppointmentById(appointmentId) {
    const query = `
      SELECT 
        a.*,
        ct.name as class_type,
        t.business_name as trainer_name,
        s.name as studio_name,
        json_agg(
          json_build_object(
            'client_id', c.id,
            'client_name', p.first_name || ' ' || p.last_name,
            'email', p.email,
            'phone', p.phone
          )
        ) as participants
      FROM appointments a
      JOIN class_types ct ON a.class_type_id = ct.id
      JOIN trainers t ON a.trainer_id = t.id
      LEFT JOIN studios s ON a.studio_id = s.id
      LEFT JOIN appointment_participants ap ON a.id = ap.appointment_id
      LEFT JOIN clients c ON ap.client_id = c.id
      LEFT JOIN persons p ON c.id = p.id
      WHERE a.id = $1
      GROUP BY a.id, ct.name, t.business_name, s.name
    `;
    
    const result = await this.query(query, [appointmentId]);
    return result.rows[0];
  }

  // Statistics
  async getNotificationStatistics(options = {}) {
    let query = `
      SELECT 
        notification_type,
        channel,
        status,
        COUNT(*) as count,
        DATE(created_at) as date
      FROM notification_queue
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;
    
    if (options.startDate) {
      query += ` AND created_at >= $${paramCount}`;
      values.push(options.startDate);
      paramCount++;
    }
    
    if (options.endDate) {
      query += ` AND created_at <= $${paramCount}`;
      values.push(options.endDate);
      paramCount++;
    }
    
    query += ` GROUP BY notification_type, channel, status, DATE(created_at)
               ORDER BY date DESC`;
    
    const result = await this.query(query, values);
    return result.rows;
  }
}

module.exports = new Database();