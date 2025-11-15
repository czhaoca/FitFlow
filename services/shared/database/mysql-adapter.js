const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
// Try to load logger from shared utils, fallback to console
let logger;
try {
  logger = require('../utils/logger');
} catch (e) {
  logger = console;
}

class MySQLAdapter {
  constructor() {
    this.pool = null;
    this.config = {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };

    // Add SSL configuration for cloud providers
    if (process.env.DB_SSL_CA) {
      this.config.ssl = {
        ca: require('fs').readFileSync(process.env.DB_SSL_CA)
      };
    }
  }

  /**
   * Initialize connection pool
   */
  async initialize() {
    try {
      this.pool = await mysql.createPool(this.config);
      
      // Test connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      
      logger.info('MySQL connection pool initialized');
      return this.pool;
    } catch (error) {
      logger.error('Failed to initialize MySQL pool:', error);
      throw error;
    }
  }

  /**
   * Execute a query
   */
  async query(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return {
        rows: Array.isArray(rows) ? rows : [],
        rowCount: rows.affectedRows || rows.length || 0,
        insertId: rows.insertId || null
      };
    } catch (error) {
      logger.error('MySQL query error:', error);
      throw error;
    }
  }

  /**
   * Get a connection from pool
   */
  async getConnection() {
    return await this.pool.getConnection();
  }

  /**
   * Begin transaction
   */
  async beginTransaction() {
    const connection = await this.getConnection();
    await connection.beginTransaction();
    return connection;
  }

  /**
   * Commit transaction
   */
  async commit(connection) {
    await connection.commit();
    connection.release();
  }

  /**
   * Rollback transaction
   */
  async rollback(connection) {
    await connection.rollback();
    connection.release();
  }

  /**
   * Generate UUID (MySQL compatible)
   */
  generateUUID() {
    return uuidv4();
  }

  /**
   * Close the connection pool
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('MySQL connection pool closed');
    }
  }

  /**
   * Create PostgreSQL-compatible interface
   */
  createCompatibleClient() {
    return {
      query: async (text, params) => {
        // Convert PostgreSQL $1, $2 to MySQL ? placeholders
        const mysqlQuery = this.convertPostgreSQLToMySQL(text);
        return this.query(mysqlQuery, params);
      },
      release: () => {
        // No-op for compatibility
      }
    };
  }

  /**
   * Convert PostgreSQL syntax to MySQL
   */
  convertPostgreSQLToMySQL(sql) {
    let mysqlSql = sql;
    
    // Replace $1, $2, etc. with ?
    mysqlSql = mysqlSql.replace(/\$(\d+)/g, '?');
    
    // Replace PostgreSQL-specific functions
    mysqlSql = mysqlSql
      // UUID generation
      .replace(/gen_random_uuid\(\)/gi, 'UUID()')
      // Current timestamp
      .replace(/NOW\(\)/gi, 'NOW()')
      .replace(/CURRENT_TIMESTAMP/gi, 'NOW()')
      // Boolean values (MySQL accepts TRUE/FALSE)
      // Interval syntax
      .replace(/INTERVAL\s+'(\d+)\s+(\w+)'/gi, 'INTERVAL $1 $2')
      // RETURNING clause (not supported in MySQL, handled separately)
      .replace(/RETURNING\s+\*/gi, '')
      .replace(/RETURNING\s+\w+/gi, '');
    
    return mysqlSql;
  }

  /**
   * Helper for INSERT with RETURNING simulation
   */
  async insertWithReturning(table, data, returning = '*') {
    const connection = await this.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Generate UUID if id not provided
      if (!data.id) {
        data.id = this.generateUUID();
      }
      
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map(() => '?').join(', ');
      
      const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
      await connection.execute(insertSql, values);
      
      // Fetch the inserted row
      let selectSql;
      if (returning === '*') {
        selectSql = `SELECT * FROM ${table} WHERE id = ?`;
      } else {
        selectSql = `SELECT ${returning} FROM ${table} WHERE id = ?`;
      }
      
      const [rows] = await connection.execute(selectSql, [data.id]);
      
      await connection.commit();
      connection.release();
      
      return {
        rows: rows,
        rowCount: 1
      };
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  }

  /**
   * Create database schema compatibility layer
   */
  async createCompatibilityViews() {
    const views = [
      // PostgreSQL NOW() function
      `CREATE OR REPLACE VIEW now AS SELECT NOW() as now`,
      
      // PostgreSQL-style boolean handling
      `CREATE OR REPLACE FUNCTION bool_to_int(b BOOLEAN) 
       RETURNS TINYINT DETERMINISTIC
       RETURN IF(b, 1, 0)`,
      
      // UUID type handling
      `CREATE OR REPLACE FUNCTION uuid_to_bin(uuid CHAR(36))
       RETURNS BINARY(16) DETERMINISTIC
       RETURN UNHEX(REPLACE(uuid, '-', ''))`,
       
      `CREATE OR REPLACE FUNCTION bin_to_uuid(b BINARY(16))
       RETURNS CHAR(36) DETERMINISTIC
       RETURN LOWER(CONCAT(
         HEX(SUBSTR(b, 1, 4)), '-',
         HEX(SUBSTR(b, 5, 2)), '-',
         HEX(SUBSTR(b, 7, 2)), '-',
         HEX(SUBSTR(b, 9, 2)), '-',
         HEX(SUBSTR(b, 11, 6))
       ))`
    ];

    for (const view of views) {
      try {
        await this.query(view);
      } catch (error) {
        logger.warn(`Failed to create compatibility view/function: ${error.message}`);
      }
    }
  }
}

// Helper functions for cloud portability

/**
 * Create connection URL from environment
 */
function createConnectionUrl() {
  const {
    DB_HOST,
    DB_PORT = 3306,
    DB_USER,
    DB_PASSWORD,
    DB_NAME
  } = process.env;
  
  return `mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

/**
 * Get cloud-specific SSL configuration
 */
function getCloudSSLConfig() {
  // AWS RDS
  if (process.env.AWS_RDS_CA_BUNDLE) {
    return {
      ca: require('fs').readFileSync('/opt/rds-ca-2019-root.pem')
    };
  }
  
  // Azure Database for MySQL
  if (process.env.AZURE_MYSQL_SSL) {
    return {
      ca: require('fs').readFileSync('/opt/BaltimoreCyberTrustRoot.crt.pem')
    };
  }
  
  // Google Cloud SQL
  if (process.env.GOOGLE_CLOUD_SQL_CA) {
    return {
      ca: require('fs').readFileSync(process.env.GOOGLE_CLOUD_SQL_CA),
      cert: require('fs').readFileSync(process.env.GOOGLE_CLOUD_SQL_CERT),
      key: require('fs').readFileSync(process.env.GOOGLE_CLOUD_SQL_KEY)
    };
  }
  
  // OCI MySQL
  if (process.env.OCI_MYSQL_SSL) {
    return {
      rejectUnauthorized: true
    };
  }
  
  return null;
}

// Export singleton instance
const adapter = new MySQLAdapter();

module.exports = {
  adapter,
  query: async (sql, params) => {
    if (!adapter.pool) {
      await adapter.initialize();
    }
    return adapter.query(sql, params);
  },
  pool: {
    query: async (sql, params) => {
      if (!adapter.pool) {
        await adapter.initialize();
      }
      return adapter.query(sql, params);
    },
    connect: async () => {
      if (!adapter.pool) {
        await adapter.initialize();
      }
      return adapter.createCompatibleClient();
    }
  },
  createConnectionUrl,
  getCloudSSLConfig
};