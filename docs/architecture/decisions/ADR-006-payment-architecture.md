# ADR-006: Payment Processing Architecture

## Status
Accepted

## Context
FitFlow needs to process payments for fitness services with the following requirements:
- Support for Canadian market (credit, debit, Interac e-Transfer)
- Dual currency support (CAD and USD only)
- Low initial transaction volume (max 100 per week)
- Prevent duplicate charges
- Maintain payment audit trail
- Future flexibility to add payment providers

## Decision
We will implement a **Payment Abstraction Layer** with initial support for Stripe and Interac e-Transfer, processing payments synchronously.

## Rationale

### Key Requirements

1. **Canadian Market Focus**: Interac e-Transfer is essential for Canadian consumers
2. **Low Volume**: 100 transactions/week doesn't require complex async processing
3. **Strong Consistency**: Payments must be processed reliably with no duplicates
4. **Provider Flexibility**: Abstraction layer allows future provider additions
5. **Simple Currency**: Only CAD/USD simplifies implementation

### Payment Methods Support

| Method | Provider | Currency | Processing |
|--------|----------|----------|------------|
| Credit Card | Stripe | CAD/USD | Instant |
| Debit Card | Stripe | CAD/USD | Instant |
| Interac e-Transfer | Bank API | CAD | 1-30 min |
| PayPal | Future | CAD/USD | Future |
| Apple Pay | Stripe | CAD/USD | Future |

## Consequences

### Positive
- Clean abstraction prevents vendor lock-in
- Idempotency prevents duplicate charges
- Synchronous processing ensures consistency
- Canadian payment methods supported
- Simple implementation for low volume

### Negative
- Need to handle Interac e-Transfer delays
- Manual reconciliation may be needed
- Limited to two currencies initially

## Implementation Details

### Payment Service Architecture
```javascript
// Payment provider interface
interface PaymentProvider {
  processPayment(amount, currency, method, metadata);
  refundPayment(paymentId, amount);
  getPaymentStatus(paymentId);
  validateWebhook(payload, signature);
}

// Main payment service
class PaymentService {
  constructor() {
    this.providers = {
      stripe: new StripeProvider(process.env.STRIPE_SECRET_KEY),
      interac: new InteracProvider(process.env.INTERAC_CONFIG)
    };
    this.supportedCurrencies = ['CAD', 'USD'];
    this.exchangeRates = { CAD: 1.0, USD: 0.74 }; // Update daily
  }

  async processPayment({
    amount,
    currency,
    method,
    clientId,
    appointmentId,
    description
  }) {
    // Validate inputs
    if (!this.supportedCurrencies.includes(currency)) {
      throw new PaymentError(
        `Currency ${currency} not supported. Use CAD or USD.`
      );
    }

    if (amount <= 0 || amount > 10000) {
      throw new PaymentError('Invalid payment amount');
    }

    // Generate idempotency key
    const idempotencyKey = this.generateIdempotencyKey({
      clientId,
      appointmentId,
      amount,
      currency
    });

    // Check if already processed
    const existing = await this.db.query(
      'SELECT * FROM payments WHERE idempotency_key = ?',
      [idempotencyKey]
    );

    if (existing.length > 0) {
      return existing[0]; // Return existing payment
    }

    // Select provider
    const provider = this.selectProvider(method);

    try {
      // Process payment
      const result = await this.providers[provider].processPayment({
        amount,
        currency,
        method,
        metadata: {
          clientId,
          appointmentId,
          description
        },
        idempotencyKey
      });

      // Store payment record
      const payment = await this.storePayment({
        id: result.id,
        provider,
        method,
        amount,
        currency,
        status: result.status,
        clientId,
        appointmentId,
        idempotencyKey,
        providerResponse: result
      });

      // Audit log
      await this.auditLog('payment.processed', payment);

      return payment;

    } catch (error) {
      await this.handlePaymentError(error, {
        clientId,
        appointmentId,
        amount,
        currency,
        method
      });
      throw error;
    }
  }

  selectProvider(method) {
    const providerMap = {
      credit_card: 'stripe',
      debit_card: 'stripe',
      etransfer: 'interac',
      interac: 'interac'
    };

    return providerMap[method] || 'stripe';
  }

  generateIdempotencyKey(data) {
    const payload = `${data.clientId}-${data.appointmentId}-${data.amount}-${data.currency}-${Math.floor(Date.now() / 60000)}`; // 1 minute window
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  async storePayment(paymentData) {
    return await this.db.transaction(async (trx) => {
      // Store payment
      const payment = await trx.insert('payments', {
        ...paymentData,
        created_at: new Date()
      });

      // Update appointment payment status
      if (paymentData.appointmentId) {
        await trx.update('appointments', {
          payment_status: paymentData.status,
          payment_id: payment.id
        }).where({ id: paymentData.appointmentId });
      }

      return payment;
    });
  }
}
```

### Stripe Provider Implementation
```javascript
class StripeProvider {
  constructor(secretKey) {
    this.stripe = require('stripe')(secretKey);
  }

  async processPayment({ amount, currency, method, metadata }) {
    // Create payment intent
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      payment_method_types: this.getPaymentMethodTypes(method),
      metadata: {
        ...metadata,
        platform: 'fitflow'
      },
      capture_method: 'automatic',
      confirm: true,
      payment_method: metadata.paymentMethodId // From frontend
    });

    return {
      id: paymentIntent.id,
      status: this.mapStatus(paymentIntent.status),
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      raw: paymentIntent
    };
  }

  getPaymentMethodTypes(method) {
    const types = {
      credit_card: ['card'],
      debit_card: ['card']
    };
    return types[method] || ['card'];
  }

  mapStatus(stripeStatus) {
    const statusMap = {
      succeeded: 'completed',
      processing: 'processing',
      requires_payment_method: 'failed',
      requires_confirmation: 'pending',
      canceled: 'canceled'
    };
    return statusMap[stripeStatus] || 'unknown';
  }
}
```

### Interac e-Transfer Provider
```javascript
class InteracProvider {
  constructor(config) {
    this.apiUrl = config.apiUrl;
    this.merchantId = config.merchantId;
    this.apiKey = config.apiKey;
  }

  async processPayment({ amount, currency, metadata }) {
    if (currency !== 'CAD') {
      throw new Error('Interac e-Transfer only supports CAD');
    }

    // Generate unique reference
    const reference = this.generateReference();

    // Create e-transfer request
    const request = {
      amount: amount,
      currency: 'CAD',
      reference: reference,
      recipientEmail: process.env.ETRANSFER_RECIPIENT_EMAIL,
      securityQuestion: 'What is your appointment ID?',
      securityAnswer: metadata.appointmentId,
      message: `FitFlow Payment - ${metadata.description}`,
      notificationUrl: `${process.env.API_URL}/webhooks/interac`
    };

    // Send to Interac API (simplified)
    const response = await fetch(`${this.apiUrl}/transfers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    const result = await response.json();

    return {
      id: result.transferId,
      status: 'pending', // e-Transfers are always pending initially
      amount: amount,
      currency: 'CAD',
      reference: reference,
      estimatedCompletion: '30 minutes',
      raw: result
    };
  }

  generateReference() {
    // Generate human-friendly reference
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `FIT-${timestamp}-${random}`;
  }

  async handleWebhook(payload, signature) {
    // Verify webhook signature
    if (!this.verifySignature(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    // Update payment status
    const { transferId, status, completedAt } = payload;
    
    await this.db.update('payments', {
      status: this.mapStatus(status),
      completed_at: completedAt,
      provider_response: payload
    }).where({ 
      provider_id: transferId,
      provider: 'interac'
    });

    return { received: true };
  }

  mapStatus(interacStatus) {
    const statusMap = {
      completed: 'completed',
      accepted: 'processing',
      declined: 'failed',
      cancelled: 'canceled',
      expired: 'failed'
    };
    return statusMap[interacStatus] || 'unknown';
  }
}
```

### Payment Reconciliation
```javascript
class PaymentReconciliation {
  async dailyReconciliation() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Get all payments from yesterday
    const payments = await this.db.query(
      `SELECT * FROM payments 
       WHERE created_at >= ? AND created_at < ?
       ORDER BY created_at`,
      [yesterday, new Date()]
    );

    const report = {
      date: yesterday,
      total_payments: payments.length,
      by_status: {},
      by_method: {},
      by_currency: {},
      total_amount: { CAD: 0, USD: 0 },
      failed_payments: [],
      pending_etransfers: []
    };

    // Analyze payments
    for (const payment of payments) {
      // Group by status
      report.by_status[payment.status] = 
        (report.by_status[payment.status] || 0) + 1;

      // Group by method
      report.by_method[payment.method] = 
        (report.by_method[payment.method] || 0) + 1;

      // Sum amounts by currency
      report.total_amount[payment.currency] += payment.amount;

      // Track issues
      if (payment.status === 'failed') {
        report.failed_payments.push(payment);
      }
      if (payment.status === 'pending' && payment.provider === 'interac') {
        report.pending_etransfers.push(payment);
      }
    }

    // Check for missing webhooks
    for (const pending of report.pending_etransfers) {
      if (pending.created_at < new Date(Date.now() - 3600000)) { // 1 hour
        await this.checkInteracStatus(pending);
      }
    }

    return report;
  }
}
```

### Database Schema
```sql
CREATE TABLE payments (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  provider VARCHAR(20) NOT NULL, -- stripe, interac
  provider_id VARCHAR(255) NOT NULL, -- External payment ID
  method VARCHAR(50) NOT NULL, -- credit_card, debit_card, etransfer
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL, -- pending, processing, completed, failed
  client_id CHAR(36) NOT NULL,
  appointment_id CHAR(36),
  idempotency_key VARCHAR(64) UNIQUE NOT NULL,
  provider_response JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  
  INDEX idx_tenant_status (tenant_id, status),
  INDEX idx_idempotency (idempotency_key),
  INDEX idx_appointment (appointment_id),
  FOREIGN KEY (tenant_id) REFERENCES studios(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id)
);

-- Payment audit log
CREATE TABLE payment_audit_log (
  id CHAR(36) PRIMARY KEY,
  payment_id CHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL,
  user_id CHAR(36),
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);
```

## Security Considerations

1. **PCI Compliance**: 
   - Never store credit card numbers
   - Use Stripe Elements for card collection
   - Tokenize all payment methods

2. **Webhook Security**:
   - Verify all webhook signatures
   - Use webhook secrets per provider
   - Implement replay attack prevention

3. **Audit Trail**:
   - Log all payment attempts
   - Track status changes
   - Maintain immutable audit log

## Future Enhancements

1. **Additional Payment Methods**:
   - PayPal integration
   - Apple Pay / Google Pay
   - Pre-authorized debit (PAD)

2. **Subscription Support**:
   - Recurring billing for memberships
   - Package deals
   - Auto-renewal

3. **Multi-Currency**:
   - EUR support for international expansion
   - Real-time exchange rates
   - Currency conversion service

## References
- [Stripe API Documentation](https://stripe.com/docs/api)
- [Interac e-Transfer API](https://www.interac.ca/en/business/interac-e-transfer/)
- [PCI DSS Requirements](https://www.pcisecuritystandards.org/)
- Original discussion: `/work/FitFlow/docs/architecture/architectural-review-discussion.md`