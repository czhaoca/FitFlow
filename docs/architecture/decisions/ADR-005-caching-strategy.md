# ADR-005: Caching Strategy

## Status
Accepted

## Context
FitFlow needs a caching strategy that balances performance with data accuracy requirements:
- Appointment data must be real-time accurate for clients and trainers
- Historical reports can tolerate some staleness
- Expected initial volume is low (100-200 requests/second)
- Need to minimize database load while ensuring consistency

## Decision
We will implement **Smart Caching with Data-Specific TTLs** based on data criticality and update frequency.

## Rationale

### Key Requirements Addressed

1. **Real-time Accuracy**: Appointments and trainer availability require immediate consistency
2. **Performance**: Reduce database queries for frequently accessed, slowly changing data
3. **Cost Efficiency**: Minimize infrastructure needs for early stage
4. **Simplicity**: Avoid complex cache invalidation strategies initially

### Caching Strategy by Data Type

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Appointment Slots | 10s or bypass | Critical for booking accuracy |
| Current Appointments | No cache | Must be real-time |
| Trainer Profiles | 5 min | Changes infrequently |
| Studio Information | 10 min | Rarely changes |
| Historical Reports | 30 min | Can tolerate staleness |
| Analytics Dashboard | 15 min | Balance between freshness and load |

## Consequences

### Positive
- Maintains data accuracy for critical operations
- Reduces database load for read-heavy operations
- Simple to implement and understand
- Can adjust TTLs based on observed patterns
- No complex invalidation logic needed

### Negative
- Some cache misses for real-time data
- Need to carefully categorize data types
- Manual TTL tuning may be required

## Implementation Details

### Cache Service Implementation
```javascript
class SmartCache {
  constructor(redis) {
    this.redis = redis;
    this.ttls = {
      // Real-time critical (very short TTL or bypass)
      appointment_availability: 10,
      trainer_schedule_today: 10,
      current_appointments: 0, // No cache
      
      // Frequently accessed, changes occasionally
      trainer_profile: 300, // 5 minutes
      trainer_schedule_week: 300,
      studio_info: 600, // 10 minutes
      service_catalog: 600,
      pricing_info: 600,
      
      // Historical/reporting data (longer TTL)
      monthly_report: 1800, // 30 minutes
      revenue_analytics: 900, // 15 minutes
      client_history: 600, // 10 minutes
      attendance_stats: 1200, // 20 minutes
      
      // Reference data (long TTL)
      timezone_data: 86400, // 24 hours
      holiday_calendar: 86400,
      system_config: 3600 // 1 hour
    };
  }

  // Generate cache key with tenant isolation
  getCacheKey(tenantId, dataType, identifier) {
    return `${tenantId}:${dataType}:${identifier}`;
  }

  // Get with automatic TTL selection
  async get(tenantId, dataType, identifier) {
    const key = this.getCacheKey(tenantId, dataType, identifier);
    const ttl = this.ttls[dataType];
    
    // Bypass cache for zero TTL
    if (ttl === 0) return null;
    
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        // Track cache hits for monitoring
        await this.redis.incr(`stats:hits:${dataType}`);
        return JSON.parse(cached);
      }
      await this.redis.incr(`stats:misses:${dataType}`);
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null; // Fail open
    }
  }

  // Set with automatic TTL selection
  async set(tenantId, dataType, identifier, data) {
    const key = this.getCacheKey(tenantId, dataType, identifier);
    const ttl = this.ttls[dataType] || 300; // Default 5 min
    
    // Skip caching for zero TTL
    if (ttl === 0) return;
    
    try {
      await this.redis.setex(
        key, 
        ttl, 
        JSON.stringify(data)
      );
    } catch (error) {
      console.error('Cache set error:', error);
      // Continue without cache
    }
  }

  // Invalidate specific cache entries
  async invalidate(tenantId, patterns) {
    for (const pattern of patterns) {
      const keys = await this.redis.keys(
        `${tenantId}:${pattern}:*`
      );
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  // Get cache statistics
  async getStats() {
    const stats = {};
    for (const dataType of Object.keys(this.ttls)) {
      stats[dataType] = {
        hits: await this.redis.get(`stats:hits:${dataType}`) || 0,
        misses: await this.redis.get(`stats:misses:${dataType}`) || 0
      };
    }
    return stats;
  }
}
```

### Repository Pattern with Caching
```javascript
class AppointmentRepository {
  constructor(db, cache) {
    this.db = db;
    this.cache = cache;
  }

  async getAvailableSlots(trainerId, date, tenantId) {
    // Check cache first
    const cacheKey = `${trainerId}:${date}`;
    const cached = await this.cache.get(
      tenantId, 
      'appointment_availability', 
      cacheKey
    );
    
    if (cached) return cached;
    
    // Query database
    const slots = await this.db.query(
      `SELECT time_slot, available 
       FROM availability 
       WHERE trainer_id = ? AND date = ? AND tenant_id = ?
       AND time_slot > NOW()`,
      [trainerId, date, tenantId]
    );
    
    // Cache result with short TTL
    await this.cache.set(
      tenantId,
      'appointment_availability',
      cacheKey,
      slots
    );
    
    return slots;
  }

  async createAppointment(data, tenantId) {
    const appointment = await this.db.transaction(async (trx) => {
      // Create appointment
      const result = await trx.insert('appointments', {
        ...data,
        tenant_id: tenantId
      });
      
      // Invalidate related caches immediately
      await this.cache.invalidate(tenantId, [
        `appointment_availability:${data.trainer_id}`,
        `trainer_schedule_today:${data.trainer_id}`,
        `trainer_schedule_week:${data.trainer_id}`
      ]);
      
      return result;
    });
    
    return appointment;
  }

  async getMonthlyReport(studioId, month, tenantId) {
    // Longer TTL for historical data
    const cacheKey = `${studioId}:${month}`;
    const cached = await this.cache.get(
      tenantId,
      'monthly_report',
      cacheKey
    );
    
    if (cached) return cached;
    
    // Complex aggregation query
    const report = await this.generateMonthlyReport(
      studioId, 
      month, 
      tenantId
    );
    
    // Cache with longer TTL
    await this.cache.set(
      tenantId,
      'monthly_report',
      cacheKey,
      report
    );
    
    return report;
  }
}
```

### Cache Warming Strategy
```javascript
// Warm cache for frequently accessed data
class CacheWarmer {
  constructor(cache, repositories) {
    this.cache = cache;
    this.repositories = repositories;
  }

  async warmCache(tenantId) {
    const tasks = [];
    
    // Warm studio info
    tasks.push(
      this.repositories.studio
        .getAllStudios(tenantId)
        .then(studios => {
          studios.forEach(studio => {
            this.cache.set(
              tenantId,
              'studio_info',
              studio.id,
              studio
            );
          });
        })
    );
    
    // Warm trainer profiles
    tasks.push(
      this.repositories.trainer
        .getActiveTrainers(tenantId)
        .then(trainers => {
          trainers.forEach(trainer => {
            this.cache.set(
              tenantId,
              'trainer_profile',
              trainer.id,
              trainer
            );
          });
        })
    );
    
    await Promise.all(tasks);
  }
}
```

### Redis Configuration
```javascript
// Redis setup with proper eviction policy
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  maxmemory: '1gb',
  maxmemoryPolicy: 'allkeys-lru' // Evict least recently used
});
```

## CDN Strategy (Deferred)

Initially, no CDN is needed due to small user base. When needed:

1. **Cloudflare Integration**:
   ```javascript
   // Future CDN configuration
   const cdnConfig = {
     provider: 'cloudflare',
     zones: {
       static: 'static.fitflow.ca',
       media: 'media.fitflow.ca'
     },
     cacheRules: {
       '/assets/*': '1 year',
       '/images/*': '1 month',
       '/api/*': 'no-cache'
     }
   };
   ```

2. **Activation Criteria**:
   - When static asset requests exceed 1000/minute
   - When users are geographically distributed
   - When bandwidth costs become significant

## Monitoring and Tuning

1. **Cache Hit Ratio Monitoring**:
   ```javascript
   // Monitor cache effectiveness
   setInterval(async () => {
     const stats = await cache.getStats();
     for (const [dataType, metrics] of Object.entries(stats)) {
       const hitRatio = metrics.hits / (metrics.hits + metrics.misses);
       console.log(`${dataType}: ${hitRatio.toFixed(2)}% hit ratio`);
       
       // Alert if hit ratio too low
       if (hitRatio < 0.5 && metrics.hits + metrics.misses > 100) {
         console.warn(`Low hit ratio for ${dataType}`);
       }
     }
   }, 60000); // Every minute
   ```

2. **TTL Adjustment Guidelines**:
   - Increase TTL if hit ratio < 50% and data rarely changes
   - Decrease TTL if stale data complaints increase
   - Monitor database load to ensure caching is effective

## References
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
- [Cache-Aside Pattern](https://docs.microsoft.com/en-us/azure/architecture/patterns/cache-aside)
- Original discussion: `/work/FitFlow/docs/architecture/architectural-review-discussion.md`