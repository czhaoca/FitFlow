# Database Portability Strategy

## Overview
FitFlow uses MySQL 8.0 as its primary database, specifically MySQL HeatWave on OCI for the initial deployment. This choice provides excellent portability across major cloud providers while maintaining high performance and managed service benefits.

## Why MySQL HeatWave?

### 1. Cloud Portability
MySQL is supported as a managed service on all major cloud platforms:
- **AWS**: Amazon RDS for MySQL, Amazon Aurora MySQL
- **Azure**: Azure Database for MySQL
- **Google Cloud**: Cloud SQL for MySQL
- **Oracle Cloud**: MySQL Database Service with HeatWave
- **On-Premise**: Standard MySQL Community/Enterprise

### 2. Feature Compatibility
- **JSON Support**: Native JSON data type (MySQL 5.7+)
- **Full-Text Search**: Built-in FTS capabilities
- **Window Functions**: Supported in MySQL 8.0
- **CTEs**: Common Table Expressions supported
- **Stored Procedures**: Full support
- **Triggers**: Full support

### 3. Performance Benefits
- **HeatWave**: In-memory analytics acceleration
- **InnoDB**: ACID-compliant storage engine
- **Query Optimization**: Cost-based optimizer
- **Parallel Query**: Available with HeatWave

## Migration Paths

### From OCI to AWS
```bash
# 1. Create RDS MySQL instance
aws rds create-db-instance \
  --db-instance-identifier fitflow-prod \
  --db-instance-class db.t3.medium \
  --engine mysql \
  --engine-version 8.0.35 \
  --allocated-storage 100

# 2. Export from OCI MySQL
mysqldump -h <oci-endpoint> -u admin -p \
  --single-transaction --routines --triggers \
  fitflow > fitflow_backup.sql

# 3. Import to RDS
mysql -h <rds-endpoint> -u admin -p fitflow < fitflow_backup.sql
```

### From OCI to Azure
```bash
# 1. Create Azure Database for MySQL
az mysql server create \
  --resource-group fitflow-rg \
  --name fitflow-mysql \
  --location canadaeast \
  --admin-user admin \
  --admin-password <password> \
  --sku-name B_Gen5_2

# 2. Use Azure Database Migration Service
# Or manual migration with mysqldump
```

### From OCI to Google Cloud
```bash
# 1. Create Cloud SQL instance
gcloud sql instances create fitflow-mysql \
  --database-version=MYSQL_8_0 \
  --tier=db-n1-standard-2 \
  --region=northamerica-northeast1

# 2. Import using Cloud SQL import
gcloud sql import sql fitflow-mysql \
  gs://fitflow-backups/fitflow_backup.sql \
  --database=fitflow
```

## Database Adapter Architecture

### Connection Abstraction
```javascript
// services/shared/database/db-connector.js
class DatabaseConnector {
  constructor() {
    this.provider = process.env.DB_PROVIDER || 'mysql';
    this.adapter = this.loadAdapter();
  }

  loadAdapter() {
    switch (this.provider) {
      case 'mysql':
        return require('./mysql-adapter');
      case 'postgresql':
        return require('./pg-adapter');
      case 'aurora':
        return require('./aurora-adapter');
      default:
        throw new Error(`Unsupported database provider: ${this.provider}`);
    }
  }

  async query(sql, params) {
    return this.adapter.query(sql, params);
  }
}
```

### Environment-Based Configuration
```bash
# OCI MySQL HeatWave
DB_PROVIDER=mysql
DB_HOST=mysql-heatwave.subnet.vcn.oraclevcn.com
DB_PORT=3306
DB_SSL_MODE=REQUIRED

# AWS RDS MySQL
DB_PROVIDER=mysql
DB_HOST=fitflow.123456.us-east-1.rds.amazonaws.com
DB_PORT=3306
DB_SSL_CA=/opt/rds-ca-2019-root.pem

# Azure Database for MySQL
DB_PROVIDER=mysql
DB_HOST=fitflow.mysql.database.azure.com
DB_PORT=3306
DB_SSL_MODE=REQUIRED

# Google Cloud SQL
DB_PROVIDER=mysql
DB_SOCKET=/cloudsql/project:region:instance
```

## SQL Compatibility Guidelines

### 1. Use Standard SQL
```sql
-- ✅ Good: Standard SQL
SELECT * FROM users WHERE created_at > NOW() - INTERVAL 30 DAY;

-- ❌ Bad: PostgreSQL-specific
SELECT * FROM users WHERE created_at > NOW() - INTERVAL '30 days';
```

### 2. Avoid Proprietary Features
```sql
-- ✅ Good: Standard JOIN
SELECT u.*, p.* 
FROM users u 
JOIN persons p ON u.id = p.user_id;

-- ❌ Bad: PostgreSQL LATERAL JOIN
SELECT u.*, p.* 
FROM users u, 
LATERAL (SELECT * FROM persons WHERE user_id = u.id) p;
```

### 3. Handle UUIDs Portably
```sql
-- MySQL: CHAR(36)
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  ...
);

-- PostgreSQL: UUID type
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);
```

### 4. JSON Operations
```sql
-- MySQL JSON
SELECT JSON_EXTRACT(metadata, '$.theme') as theme
FROM users
WHERE JSON_CONTAINS(metadata, '"dark"', '$.theme');

-- PostgreSQL JSONB
SELECT metadata->>'theme' as theme
FROM users
WHERE metadata @> '{"theme": "dark"}';
```

## Performance Considerations

### 1. Index Strategy
```sql
-- Standard B-tree indexes work everywhere
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_appointments_schedule ON appointments(trainer_id, start_time);

-- Composite indexes for common queries
CREATE INDEX idx_client_history ON appointments(client_id, start_time DESC);
```

### 2. Query Optimization
```sql
-- Use EXPLAIN to verify query plans
EXPLAIN SELECT * FROM appointments 
WHERE trainer_id = ? 
AND start_time BETWEEN ? AND ?;

-- Force index usage if needed
SELECT * FROM appointments USE INDEX (idx_trainer_schedule)
WHERE trainer_id = ? 
AND start_time BETWEEN ? AND ?;
```

### 3. Connection Pooling
```javascript
// Configure based on cloud provider limits
const poolConfig = {
  // OCI MySQL: Higher limits
  connectionLimit: 100,
  
  // AWS RDS: Based on instance class
  connectionLimit: 50,
  
  // Azure: Based on pricing tier
  connectionLimit: 30,
  
  // Common settings
  waitForConnections: true,
  queueLimit: 0
};
```

## Monitoring and Maintenance

### 1. Cloud-Specific Monitoring
- **OCI**: MySQL HeatWave Console
- **AWS**: CloudWatch + Performance Insights
- **Azure**: Azure Monitor
- **GCP**: Cloud Monitoring

### 2. Backup Strategies
```bash
# Automated backups (all providers)
- Point-in-time recovery
- Automated snapshots
- Cross-region replication

# Manual backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  fitflow > backup_${DATE}.sql
```

### 3. Migration Testing
```javascript
// Test suite for database portability
describe('Database Portability Tests', () => {
  const providers = ['mysql', 'aurora', 'azure-mysql', 'cloud-sql'];
  
  providers.forEach(provider => {
    it(`should execute queries on ${provider}`, async () => {
      const db = new DatabaseConnector({ provider });
      const result = await db.query('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);
    });
  });
});
```

## Cost Optimization

### Provider Comparison (USD/month)
| Provider | 2 vCPU, 8GB RAM | Storage (100GB) | Total |
|----------|-----------------|-----------------|--------|
| OCI MySQL HeatWave | $0 (Free Tier) | $0 (50GB free) | $0 |
| AWS RDS MySQL | ~$100 | ~$12 | ~$112 |
| Azure Database | ~$120 | ~$15 | ~$135 |
| Google Cloud SQL | ~$110 | ~$17 | ~$127 |

### Optimization Tips
1. Use read replicas for scaling reads
2. Enable query caching where available
3. Use connection pooling to reduce overhead
4. Archive old data to object storage
5. Use reserved instances for production

## Future Considerations

### 1. Multi-Region Deployment
- Use MySQL Group Replication
- Or cloud-specific solutions (Aurora Global, Azure Geo-Replication)

### 2. Hybrid Cloud
- MySQL supports hybrid deployments
- Can replicate between cloud and on-premise

### 3. Data Warehousing
- HeatWave for analytics (OCI)
- Aurora for analytics (AWS)
- BigQuery federation (GCP)
- Synapse Link (Azure)

## Conclusion

MySQL provides the best balance of:
- **Portability**: Runs everywhere
- **Performance**: Excellent with proper optimization
- **Features**: Rich feature set for modern applications
- **Cost**: Competitive across providers
- **Support**: Wide ecosystem and community

This strategy ensures FitFlow can move between cloud providers with minimal friction while maintaining performance and reliability.