# ADR-007: Event-Driven Architecture Strategy

## Status
Accepted

## Context
FitFlow's microservices need to communicate for various operations:
- Appointment creation triggers notifications
- Payment completion updates appointment status
- Client actions need audit logging

Key constraints:
- Appointments and payments require strong consistency
- Low initial volume (< 100 events/minute)
- Team prefers simple, understandable solutions
- Need to prepare for future scaling

## Decision
We will **defer full event-driven architecture** and use **synchronous processing with event interface stubs** for future migration.

## Rationale

### Key Requirements

1. **Strong Consistency**: Appointments and payments cannot tolerate eventual consistency
2. **Low Volume**: Current volume doesn't justify message queue complexity
3. **Simple Operations**: Direct database writes are sufficient for current scale
4. **Future Flexibility**: Interface stubs allow seamless migration later
5. **Audit Requirements**: All events must be logged for compliance

### Consistency Requirements by Operation

| Operation | Consistency Requirement | Current Approach | Future Approach |
|-----------|------------------------|------------------|-----------------|
| Book Appointment | Strong | Direct DB write | Sync write + async events |
| Process Payment | Strong | Direct DB write | Sync write + async events |
| Send Notification | Eventual | Sync call (for now) | Message queue |
| Update Analytics | Eventual | Batch job | Event stream |
| Audit Logging | Immediate | Direct DB write | Immutable event log |

## Consequences

### Positive
- Simple to implement and debug
- Strong consistency guaranteed
- No message queue infrastructure needed
- Clear migration path when needed
- All code remains readable

### Negative
- Services remain coupled for now
- No built-in retry mechanisms
- Limited scalability initially
- Manual handling of failed operations

## Implementation Details

### Event Bus Interface (Stubbed)
```javascript
// Event bus with future-ready interface
class EventBus {
  constructor() {
    this.syncMode = true; // Start synchronous
    this.handlers = new Map();
    this.eventLog = []; // In-memory for development
  }

  // Register event handler (for future use)
  on(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType).add(handler);
  }

  // Remove event handler
  off(eventType, handler) {
    if (this.handlers.has(eventType)) {
      this.handlers.get(eventType).delete(handler);
    }
  }

  // Publish event (sync now, async later)
  async publish(eventType, data, options = {}) {
    const event = {
      id: this.generateEventId(),
      type: eventType,
      data: data,
      metadata: {
        tenantId: options.tenantId,
        userId: options.userId,
        correlationId: options.correlationId || this.generateCorrelationId(),
        timestamp: new Date().toISOString(),
        version: '1.0'
      }
    };

    // Always audit log
    await this.auditLog(event);

    if (this.syncMode) {
      // Synchronous mode - execute handlers immediately
      await this.executeSyncHandlers(event);
    } else {
      // Future: Publish to message queue
      await this.publishToQueue(event);
    }

    return event.id;
  }

  // Execute handlers synchronously
  async executeSyncHandlers(event) {
    const handlers = this.handlers.get(event.type) || new Set();
    
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Handler error for ${event.type}:`, error);
        // In sync mode, we continue processing other handlers
        // In async mode, this would go to DLQ
      }
    }
  }

  // Audit log all events
  async auditLog(event) {
    await db.query(
      `INSERT INTO event_log 
       (id, event_type, event_data, metadata, created_at) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        event.id,
        event.type,
        JSON.stringify(event.data),
        JSON.stringify(event.metadata),
        new Date()
      ]
    );
  }

  // Future: Publish to message queue
  async publishToQueue(event) {
    // Stub for future implementation
    // await this.messageQueue.publish(event.type, event);
    throw new Error('Async mode not yet implemented');
  }

  // Switch to async mode (future)
  async enableAsyncMode(messageQueueConfig) {
    // Validate all handlers are async-ready
    for (const [eventType, handlers] of this.handlers) {
      if (handlers.size === 0) {
        console.warn(`No handlers for event type: ${eventType}`);
      }
    }

    // Initialize message queue connection
    // this.messageQueue = new MessageQueue(messageQueueConfig);
    
    this.syncMode = false;
    console.log('Event bus switched to async mode');
  }

  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateCorrelationId() {
    return `cor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Global event bus instance
const eventBus = new EventBus();
module.exports = eventBus;
```

### Service Integration Pattern
```javascript
// Appointment service with event stubs
class AppointmentService {
  async createAppointment(data, context) {
    let appointment;
    
    // Transaction ensures consistency
    await db.transaction(async (trx) => {
      // 1. Validate slot availability
      const available = await this.checkAvailability(
        data.trainerId,
        data.startTime,
        data.endTime,
        trx
      );
      
      if (!available) {
        throw new Error('Time slot not available');
      }

      // 2. Create appointment (strong consistency)
      appointment = await trx.insert('appointments', {
        id: generateId(),
        tenant_id: context.tenantId,
        trainer_id: data.trainerId,
        client_id: data.clientId,
        start_time: data.startTime,
        end_time: data.endTime,
        service_id: data.serviceId,
        status: 'confirmed',
        created_at: new Date()
      });

      // 3. Update availability (strong consistency)
      await trx.update('availability', {
        available: false
      }).where({
        trainer_id: data.trainerId,
        time_slot: data.startTime
      });
    });

    // 4. Publish event (currently just logs)
    await eventBus.publish('appointment.created', {
      appointmentId: appointment.id,
      trainerId: appointment.trainer_id,
      clientId: appointment.client_id,
      startTime: appointment.start_time,
      serviceId: appointment.service_id
    }, {
      tenantId: context.tenantId,
      userId: context.userId
    });

    // 5. Synchronous side effects (for now)
    await this.sendConfirmationEmail(appointment);
    await this.updateTrainerCalendar(appointment);
    await this.notifyMobileApp(appointment);

    return appointment;
  }

  async cancelAppointment(appointmentId, reason, context) {
    const appointment = await db.transaction(async (trx) => {
      // Update appointment
      const updated = await trx.update('appointments', {
        status: 'cancelled',
        cancelled_at: new Date(),
        cancellation_reason: reason
      }).where({
        id: appointmentId,
        tenant_id: context.tenantId
      }).returning('*');

      // Release time slot
      await trx.update('availability', {
        available: true
      }).where({
        trainer_id: updated.trainer_id,
        time_slot: updated.start_time
      });

      return updated;
    });

    // Publish event
    await eventBus.publish('appointment.cancelled', {
      appointmentId: appointment.id,
      reason: reason,
      refundRequired: this.isRefundRequired(appointment)
    }, context);

    // Handle side effects
    if (this.isRefundRequired(appointment)) {
      await this.processRefund(appointment);
    }
    await this.sendCancellationEmail(appointment);

    return appointment;
  }
}
```

### Future Event Handlers
```javascript
// These handlers will be moved to separate services
// when we switch to async mode

// Notification handler
eventBus.on('appointment.created', async (event) => {
  const { appointmentId, trainerId, clientId } = event.data;
  
  // Get appointment details
  const appointment = await db.findById('appointments', appointmentId);
  
  // Send notifications
  await notificationService.send({
    type: 'appointment_confirmation',
    recipientId: clientId,
    data: appointment
  });
  
  await notificationService.send({
    type: 'new_appointment',
    recipientId: trainerId,
    data: appointment
  });
});

// Analytics handler
eventBus.on('appointment.created', async (event) => {
  // Update analytics (can be async in future)
  await analyticsService.track({
    event: 'appointment_created',
    properties: {
      trainerId: event.data.trainerId,
      serviceId: event.data.serviceId,
      dayOfWeek: new Date(event.data.startTime).getDay(),
      timeOfDay: new Date(event.data.startTime).getHours()
    }
  });
});

// Payment handler
eventBus.on('payment.completed', async (event) => {
  const { paymentId, appointmentId, amount } = event.data;
  
  // Update appointment payment status
  await db.update('appointments', {
    payment_status: 'paid',
    payment_id: paymentId,
    paid_at: new Date()
  }).where({ id: appointmentId });
  
  // Update trainer earnings
  await earningsService.recordEarning({
    appointmentId,
    amount,
    paymentId
  });
});
```

### Event Store Schema
```sql
-- Immutable event log
CREATE TABLE event_log (
  id VARCHAR(50) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  event_data JSON NOT NULL,
  metadata JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at),
  INDEX idx_tenant (metadata->>'$.tenantId'),
  INDEX idx_correlation (metadata->>'$.correlationId')
);

-- Event subscriptions (for future use)
CREATE TABLE event_subscriptions (
  id CHAR(36) PRIMARY KEY,
  service_name VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  endpoint_url VARCHAR(500),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_subscription (service_name, event_type)
);
```

### Migration Path to Async

When volume justifies async processing:

```javascript
// 1. Choose message queue
const messageQueueConfig = {
  provider: 'redis-streams', // or 'rabbitmq', 'kafka'
  connection: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
};

// 2. Update handlers to be idempotent
const idempotentHandler = async (event) => {
  // Check if already processed
  const processed = await db.exists('processed_events', event.id);
  if (processed) return;
  
  // Process event
  await handleEvent(event);
  
  // Mark as processed
  await db.insert('processed_events', {
    event_id: event.id,
    processed_at: new Date()
  });
};

// 3. Enable async mode
await eventBus.enableAsyncMode(messageQueueConfig);

// 4. Deploy workers for each event type
class AppointmentEventWorker {
  async start() {
    await messageQueue.subscribe('appointment.*', async (event) => {
      await idempotentHandler(event);
    });
  }
}
```

## Implementation Phases

### Phase 1: Current Implementation ✅
- Synchronous event publishing (just logging)
- Direct service calls for side effects
- Strong consistency for critical operations

### Phase 2: When Needed (>1000 events/hour)
- Add Redis Streams for event bus
- Move notification sending to async
- Keep payments and appointments sync

### Phase 3: Scale (>10000 events/hour)
- Full event sourcing for audit trail
- CQRS for read/write separation
- Consider Kafka for high throughput

## Monitoring

```javascript
// Monitor event processing
class EventMonitor {
  async getStats() {
    const stats = await db.query(`
      SELECT 
        event_type,
        COUNT(*) as count,
        DATE(created_at) as date
      FROM event_log
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY event_type, DATE(created_at)
      ORDER BY date DESC, count DESC
    `);
    
    return stats;
  }
  
  async getFailedEvents() {
    // In sync mode, check application logs
    // In async mode, check dead letter queue
  }
}
```

## References
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
- [CQRS Pattern](https://martinfowler.com/bliki/CQRS.html)
- [Eventual Consistency](https://www.allthingsdistributed.com/2008/12/eventually_consistent.html)
- Original discussion: `/work/FitFlow/docs/architecture/architectural-review-discussion.md`