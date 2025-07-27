# ADR-002: Database Platform Selection

## Status
Accepted

## Context
The FitFlow application was initially designed for PostgreSQL but targeted for deployment on Oracle Autonomous Database. This mismatch creates several challenges:
- Code compatibility issues between PostgreSQL and Oracle SQL dialects
- Different feature sets (JSONB, arrays, extensions)
- Team has limited Oracle expertise
- Desire for cloud portability and avoiding vendor lock-in

## Decision
We will use **MySQL HeatWave** on OCI as our database platform.

## Rationale

### Options Considered

1. **Complete Oracle Adapter**
   - Maintain compatibility layer for both PostgreSQL and Oracle
   - 4-6 weeks development effort
   - Ongoing maintenance burden

2. **PostgreSQL on OCI VM**
   - Manual management required
   - No managed backup/scaling
   - Additional operational overhead

3. **MySQL HeatWave** ✅ **SELECTED**
   - OCI managed service with 50GB free tier
   - Standard MySQL 8.0 syntax
   - Excellent cloud portability

### Key Decision Factors

1. **Cloud Portability**: MySQL syntax is directly compatible with:
   - AWS RDS MySQL
   - Azure Database for MySQL  
   - Google Cloud SQL
   - Any standard MySQL deployment

2. **No Vendor Lock-in**: Avoids Oracle-specific features and syntax that would make migration difficult.

3. **Team Expertise**: MySQL is widely known and has extensive documentation and community support.

4. **Managed Service Benefits**:
   - Automated backups
   - High availability
   - Built-in monitoring
   - Security patches

5. **HeatWave Analytics**: Provides real-time analytics capabilities for future reporting needs.

## Consequences

### Positive
- Easy migration between cloud providers
- Standard SQL syntax familiar to developers
- Rich ecosystem of tools and libraries
- Lower learning curve for team
- 50GB free tier (vs 20GB for Oracle ATP)

### Negative
- Need to migrate from PostgreSQL-specific features
- Some query optimizations may differ
- Loss of PostgreSQL-specific extensions

## Implementation Details

### Connection Configuration
```javascript
// MySQL connection using mysql2
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 40,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: true
  }
});
```

### Migration from PostgreSQL
```sql
-- PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SELECT uuid_generate_v4();

-- MySQL equivalent
-- No extension needed
SELECT UUID();

-- PostgreSQL JSONB
data JSONB NOT NULL

-- MySQL JSON
data JSON NOT NULL CHECK (JSON_VALID(data))
```

### Environment Variables
```bash
# Development
DB_HOST=mysql-dev.mysql.database.oraclecloud.com
DB_PORT=3306
DB_NAME=fitflow_dev

# Production  
DB_HOST=mysql-prod.mysql.database.oraclecloud.com
DB_PORT=3306
DB_NAME=fitflow_prod
```

## Migration Plan

1. **Immediate Actions**:
   - Update database connection code to use mysql2
   - Migrate schema definitions to MySQL syntax
   - Update queries to remove PostgreSQL-specific features

2. **Testing Requirements**:
   - Full regression testing with MySQL
   - Performance benchmarking
   - Backup/restore procedures

3. **Future Considerations**:
   - Leverage HeatWave analytics for reporting
   - Consider read replicas for scaling
   - Implement connection pooling optimizations

## References
- [MySQL HeatWave Documentation](https://docs.oracle.com/en/cloud/paas/mysql-cloud/)
- [MySQL 8.0 Reference Manual](https://dev.mysql.com/doc/refman/8.0/en/)
- [Node.js mysql2 Driver](https://github.com/sidorares/node-mysql2)
- Original discussion: `/work/FitFlow/docs/architecture/architectural-review-discussion.md`