const oracledb = require('oracledb');
const { v4: uuidv4 } = require('uuid');

// Initialize Oracle Client for thick mode (required for some features)
if (process.env.TNS_ADMIN) {
  oracledb.initOracleClient({ 
    libDir: process.env.ORACLE_CLIENT_PATH || '/opt/oracle/instantclient',
    configDir: process.env.TNS_ADMIN
  });
}

// Configure connection pool
const poolConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionString: process.env.DB_CONNECTION_STRING,
  poolMin: 10,
  poolMax: 40,
  poolIncrement: 5,
  poolTimeout: 60,
  poolAlias: 'default'
};

class OCIAdapter {
  constructor() {
    this.pool = null;
    this.isInitialized = false;
  }

  /**
   * Initialize connection pool
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      this.pool = await oracledb.createPool(poolConfig);
      this.isInitialized = true;
      console.log('OCI Database pool initialized');
    } catch (err) {
      console.error('Error creating OCI pool:', err);
      throw err;
    }
  }

  /**
   * Execute a query with PostgreSQL-style parameters ($1, $2, etc.)
   */
  async query(sql, params = []) {
    let connection;
    try {
      // Convert PostgreSQL-style parameters to Oracle style (:1, :2, etc.)
      const oracleSql = this.convertPostgreSQLToOracle(sql);
      
      connection = await oracledb.getConnection();
      const result = await connection.execute(
        oracleSql,
        params,
        { 
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          autoCommit: true 
        }
      );

      // Convert Oracle result to PostgreSQL-like format
      return {
        rows: result.rows || [],
        rowCount: result.rowsAffected || 0
      };
    } catch (err) {
      console.error('Query error:', err);
      throw err;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /**
   * Convert PostgreSQL parameter syntax to Oracle
   */
  convertPostgreSQLToOracle(sql) {
    // Replace $1, $2, etc. with :1, :2, etc.
    let oracleSql = sql.replace(/\$(\d+)/g, ':$1');
    
    // Common PostgreSQL to Oracle conversions
    oracleSql = oracleSql
      // UUID generation
      .replace(/gen_random_uuid\(\)/gi, 'SYS_GUID()')
      // Current timestamp
      .replace(/NOW\(\)/gi, 'SYSTIMESTAMP')
      .replace(/CURRENT_TIMESTAMP/gi, 'SYSTIMESTAMP')
      // Boolean true/false
      .replace(/\btrue\b/gi, '1')
      .replace(/\bfalse\b/gi, '0')
      // LIMIT clause (Oracle uses FETCH FIRST)
      .replace(/LIMIT\s+(\d+)/gi, 'FETCH FIRST $1 ROWS ONLY')
      // OFFSET clause
      .replace(/OFFSET\s+(\d+)/gi, 'OFFSET $1 ROWS')
      // Serial/Identity columns (handled in schema)
      .replace(/\bSERIAL\b/gi, 'NUMBER')
      // Array operations (convert to JSON)
      .replace(/\s+TEXT\[\]/gi, ' CLOB')
      .replace(/\s+VARCHAR\[\]/gi, ' CLOB');

    return oracleSql;
  }

  /**
   * PostgreSQL-compatible transaction methods
   */
  async beginTransaction() {
    const connection = await oracledb.getConnection();
    await connection.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    return connection;
  }

  async commit(connection) {
    await connection.commit();
    await connection.close();
  }

  async rollback(connection) {
    await connection.rollback();
    await connection.close();
  }

  /**
   * Helper method to generate UUID (Oracle doesn't have native UUID)
   */
  generateUUID() {
    return uuidv4();
  }

  /**
   * Convert UUID string to Oracle RAW format
   */
  uuidToRaw(uuid) {
    return Buffer.from(uuid.replace(/-/g, ''), 'hex');
  }

  /**
   * Convert Oracle RAW to UUID string
   */
  rawToUuid(raw) {
    if (!raw) return null;
    const hex = raw.toString('hex');
    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32)
    ].join('-');
  }

  /**
   * Create PostgreSQL-compatible pool interface
   */
  async getClient() {
    const connection = await oracledb.getConnection();
    
    // Wrap connection to provide PostgreSQL-like interface
    return {
      query: async (sql, params) => {
        const oracleSql = this.convertPostgreSQLToOracle(sql);
        const result = await connection.execute(
          oracleSql,
          params,
          { 
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: false 
          }
        );
        return {
          rows: result.rows || [],
          rowCount: result.rowsAffected || 0
        };
      },
      release: async () => {
        await connection.close();
      }
    };
  }

  /**
   * Close the connection pool
   */
  async close() {
    if (this.pool) {
      await this.pool.close(10);
      this.isInitialized = false;
    }
  }
}

// Helper functions for common Oracle operations

/**
 * Create Oracle-compatible JSONB operations
 */
const jsonOps = {
  // Store JSON in CLOB with JSON constraint
  createJSONColumn: (tableName, columnName) => {
    return `
      ALTER TABLE ${tableName} ADD (
        ${columnName} CLOB 
        CONSTRAINT ${tableName}_${columnName}_json 
        CHECK (${columnName} IS JSON)
      )
    `;
  },

  // Query JSON data
  queryJSON: (column, path) => {
    return `JSON_VALUE(${column}, '$.${path}')`;
  },

  // Update JSON data
  updateJSON: (column, path, value) => {
    return `JSON_MERGEPATCH(${column}, '{"${path}": ${JSON.stringify(value)}}')`;
  }
};

/**
 * UUID support for Oracle
 */
const uuidOps = {
  // Create UUID type (RAW(16))
  createUUIDColumn: (tableName, columnName) => {
    return `ALTER TABLE ${tableName} ADD ${columnName} RAW(16)`;
  },

  // Generate UUID default
  uuidDefault: () => {
    return 'SYS_GUID()';
  }
};

/**
 * PostgreSQL array operations for Oracle
 */
const arrayOps = {
  // Convert array to JSON array
  arrayToJSON: (values) => {
    return JSON.stringify(values);
  },

  // Query array contains
  arrayContains: (column, value) => {
    return `JSON_EXISTS(${column}, '$[*]?(@ == "${value}")')`;
  }
};

// Export singleton instance
const adapter = new OCIAdapter();

module.exports = {
  adapter,
  jsonOps,
  uuidOps,
  arrayOps,
  
  // Convenience method for backward compatibility
  query: async (sql, params) => {
    if (!adapter.isInitialized) {
      await adapter.initialize();
    }
    return adapter.query(sql, params);
  },
  
  // Pool interface for compatibility
  pool: {
    query: async (sql, params) => {
      if (!adapter.isInitialized) {
        await adapter.initialize();
      }
      return adapter.query(sql, params);
    },
    connect: async () => {
      if (!adapter.isInitialized) {
        await adapter.initialize();
      }
      return adapter.getClient();
    }
  }
};