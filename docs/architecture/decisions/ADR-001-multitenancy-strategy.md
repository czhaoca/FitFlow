# ADR-001: Multi-Tenancy Strategy

## Status
Accepted

## Context
FitFlow needs to support multiple fitness studios where:
- Studio owners can manage one or more studio locations
- Trainers may work at multiple studios, even on the same day
- Each studio's data must be isolated from others
- The system needs to support cross-studio reporting for franchise owners
- Expected scale is small to medium studios (not 1000s of clients per studio)

## Decision
We will implement multi-tenancy using a **Shared Tables with Tenant ID** approach.

## Rationale

### Options Considered

1. **Schema-Based Multi-Tenancy**
   - Each studio gets its own database schema
   - Complete logical separation
   - Complex for trainers working across studios

2. **Shared Tables with Tenant ID** ✅ **SELECTED**
   - All studios share the same tables
   - Each record includes a tenant_id column
   - Simpler implementation and maintenance

3. **Database-per-Tenant**
   - Each studio gets its own database
   - Maximum isolation
   - Overkill for our scale and use case

### Key Decision Factors

1. **Trainer Flexibility**: Trainers frequently work at multiple studios on the same day (e.g., Studio A in morning, Studio B in afternoon). Schema separation would make this overly complicated.

2. **Scale Considerations**: Studios won't grow to 1000s of active clients. The shared table approach with proper indexing will perform adequately for our expected scale.

3. **Operational Simplicity**: The team prefers a simpler implementation that's easier to maintain and operate.

4. **Resource Efficiency**: Better utilization of database resources for smaller studios.

5. **Cross-Studio Features**: Easier to implement reporting and analytics across multiple studios for franchise owners.

## Consequences

### Positive
- Simple to implement and maintain
- Easy to support trainers working across studios
- Efficient resource utilization
- Straightforward cross-studio queries
- Single database backup/restore process

### Negative
- Requires careful implementation of Row-Level Security
- All queries must include tenant_id filter
- Potential for data leakage if RLS is misconfigured
- Shared resource limits across all tenants

## Implementation Details

### Database Schema
```sql
-- All tables include tenant_id
ALTER TABLE appointments ADD COLUMN tenant_id UUID NOT NULL;
ALTER TABLE clients ADD COLUMN tenant_id UUID NOT NULL;
ALTER TABLE invoices ADD COLUMN tenant_id UUID NOT NULL;

-- Composite indexes for performance
CREATE INDEX idx_appointments_tenant ON appointments(tenant_id, start_time);
CREATE INDEX idx_clients_tenant ON clients(tenant_id, created_at);
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id, due_date);

-- Trainer-Studio relationship (many-to-many)
CREATE TABLE trainer_studios (
  trainer_id UUID NOT NULL,
  studio_id UUID NOT NULL,
  role VARCHAR(50) DEFAULT 'trainer',
  active BOOLEAN DEFAULT true,
  PRIMARY KEY (trainer_id, studio_id),
  FOREIGN KEY (trainer_id) REFERENCES users(id),
  FOREIGN KEY (studio_id) REFERENCES studios(id)
);
```

### Application Layer
```javascript
// Middleware to enforce tenant isolation
const tenantContext = async (req, res, next) => {
  const userStudios = req.user.studios; // From JWT
  const studioId = req.params.studioId || req.body.studioId || req.query.studioId;
  
  // Verify user has access to the requested studio
  if (!userStudios.includes(studioId)) {
    return res.status(403).json({ error: 'Access denied to this studio' });
  }
  
  // Set tenant context for all queries
  req.tenantId = studioId;
  req.db = req.db.withTenant(studioId); // Automatic tenant filtering
  
  next();
};

// Repository pattern with automatic tenant filtering
class AppointmentRepository {
  constructor(db, tenantId) {
    this.db = db;
    this.tenantId = tenantId;
  }
  
  async findAll() {
    return this.db('appointments')
      .where('tenant_id', this.tenantId)
      .orderBy('start_time', 'desc');
  }
  
  async create(data) {
    return this.db('appointments')
      .insert({
        ...data,
        tenant_id: this.tenantId // Always inject tenant_id
      });
  }
}
```

### Security Measures
1. Row-Level Security policies in database
2. Tenant ID validation in application middleware
3. JWT tokens include allowed studio IDs
4. Audit logging for all cross-studio access
5. Regular security reviews of tenant isolation

## References
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-Tenant SaaS Patterns](https://docs.microsoft.com/en-us/azure/sql-database/saas-tenancy-app-design-patterns)
- Original discussion: `/work/FitFlow/docs/architecture/architectural-review-discussion.md`