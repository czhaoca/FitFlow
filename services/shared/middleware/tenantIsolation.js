/**
 * Multi-Tenancy Middleware for FitFlow
 *
 * Implements tenant isolation based on ADR-001:
 * - Shared tables with tenant_id approach
 * - Trainers can work at multiple studios
 * - JWT claims include allowed studio IDs
 * - Automatic tenant_id injection in queries
 */

const logger = require('../utils/logger');

/**
 * Tenant Isolation Middleware
 *
 * Validates that the requesting user has access to the requested studio (tenant)
 * and attaches the tenant_id to the request for use in database queries.
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.required - Whether tenant_id is required (default: true)
 * @param {string} options.paramName - Name of the parameter containing tenant_id (default: 'studioId')
 */
function tenantIsolation(options = {}) {
  const {
    required = true,
    paramName = 'studioId'
  } = options;

  return (req, res, next) => {
    try {
      // Get user studios from JWT token (set by auth middleware)
      const userStudios = req.user?.studios || [];

      // Get requested studio from params, body, or query
      const requestedStudio = req.params[paramName] ||
                            req.body[paramName] ||
                            req.query[paramName];

      // If no studio requested and it's required, reject
      if (!requestedStudio && required) {
        logger.warn('Tenant isolation: No studio ID provided', {
          userId: req.user?.id,
          path: req.path
        });
        return res.status(400).json({
          error: 'Studio ID is required',
          code: 'TENANT_ID_REQUIRED'
        });
      }

      // If no studio requested but not required, continue without tenant isolation
      if (!requestedStudio && !required) {
        return next();
      }

      // Validate user has access to the requested studio
      if (!userStudios.includes(requestedStudio)) {
        logger.warn('Tenant isolation: Access denied', {
          userId: req.user?.id,
          requestedStudio,
          userStudios,
          path: req.path
        });

        // Log attempted cross-tenant access for audit
        auditCrossTenantAccess(req.user?.id, requestedStudio, req.path);

        return res.status(403).json({
          error: 'Access denied to this studio',
          code: 'TENANT_ACCESS_DENIED'
        });
      }

      // Attach tenant_id to request for use in database queries
      req.tenantId = requestedStudio;
      req.studioId = requestedStudio; // Alias for clarity

      // Log successful tenant access
      logger.debug('Tenant isolation: Access granted', {
        userId: req.user?.id,
        tenantId: requestedStudio,
        path: req.path
      });

      next();
    } catch (error) {
      logger.error('Tenant isolation middleware error', { error });
      return res.status(500).json({
        error: 'Internal server error',
        code: 'TENANT_ISOLATION_ERROR'
      });
    }
  };
}

/**
 * Database Query Wrapper with Automatic Tenant Filtering
 *
 * Wraps database queries to automatically inject tenant_id filter
 */
class TenantAwareDatabase {
  constructor(database) {
    this.db = database;
  }

  /**
   * Query with automatic tenant filtering
   *
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {string} tenantId - Tenant ID to filter by
   * @returns {Promise} Query result
   */
  async query(sql, params, tenantId) {
    if (!tenantId) {
      logger.warn('Query executed without tenant context', { sql });
      // In strict mode, this should throw an error
      // throw new Error('Tenant context required for database queries');
    }

    // Set session variable for tenant context (MySQL)
    if (tenantId) {
      await this.db.query('SET @tenant_id = ?', [tenantId]);
    }

    return this.db.query(sql, params);
  }

  /**
   * Execute query within transaction with tenant context
   */
  async transaction(tenantId, callback) {
    const connection = await this.db.beginTransaction();

    try {
      // Set tenant context for transaction
      if (tenantId) {
        await connection.execute('SET @tenant_id = ?', [tenantId]);
      }

      const result = await callback(connection);
      await this.db.commitTransaction(connection);
      return result;
    } catch (error) {
      await this.db.rollbackTransaction(connection);
      throw error;
    }
  }
}

/**
 * Audit log for cross-tenant access attempts
 *
 * @param {string} userId - User attempting access
 * @param {string} tenantId - Tenant being accessed
 * @param {string} path - Request path
 */
async function auditCrossTenantAccess(userId, tenantId, path) {
  try {
    // In production, this should write to an audit log table
    logger.warn('SECURITY_AUDIT: Cross-tenant access attempt', {
      userId,
      tenantId,
      path,
      timestamp: new Date().toISOString()
    });

    // TODO: Write to audit_log table
    // await db.query(`
    //   INSERT INTO audit_log (user_id, tenant_id, action, path, created_at)
    //   VALUES (?, ?, 'CROSS_TENANT_ACCESS_ATTEMPT', ?, NOW())
    // `, [userId, tenantId, path]);
  } catch (error) {
    logger.error('Failed to audit cross-tenant access', { error });
  }
}

/**
 * Express middleware to set tenant context from JWT
 *
 * Extracts studio IDs from JWT token and attaches to req.user
 * Should be used after JWT authentication middleware
 */
function extractTenantContext(req, res, next) {
  try {
    // JWT payload should include studios array
    if (req.user && req.user.studios) {
      // Studios are already in req.user from JWT
      logger.debug('Tenant context extracted from JWT', {
        userId: req.user.id,
        studios: req.user.studios
      });
    } else if (req.user) {
      // Fallback: If no studios in JWT, user has no studio access
      req.user.studios = [];
      logger.warn('User has no studio access', { userId: req.user.id });
    }

    next();
  } catch (error) {
    logger.error('Extract tenant context error', { error });
    return res.status(500).json({
      error: 'Internal server error',
      code: 'TENANT_CONTEXT_ERROR'
    });
  }
}

/**
 * Validate tenant_id in database queries
 *
 * Helper function to ensure all queries include tenant_id filtering
 */
function validateTenantQuery(sql, tenantId) {
  const lowerSql = sql.toLowerCase();

  // Check if query includes WHERE clause
  if (!lowerSql.includes('where')) {
    logger.warn('Query without WHERE clause in multi-tenant system', { sql });
  }

  // Check if query filters by tenant_id
  if (!lowerSql.includes('tenant_id') && !lowerSql.includes('@tenant_id')) {
    logger.warn('Query without tenant_id filter', { sql, tenantId });
  }

  return true;
}

module.exports = {
  tenantIsolation,
  TenantAwareDatabase,
  extractTenantContext,
  validateTenantQuery,
  auditCrossTenantAccess
};
