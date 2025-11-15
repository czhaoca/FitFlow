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

  async getClient(clientId) {
    const query = 'SELECT * FROM clients WHERE id = $1';
    const result = await this.query(query, [clientId]);
    return result.rows[0];
  }

  async getPackage(packageId) {
    const query = 'SELECT * FROM payment_packages WHERE id = $1';
    const result = await this.query(query, [packageId]);
    return result.rows[0];
  }

  async recordPayment(paymentData) {
    const query = `
      INSERT INTO payments (
        stripe_payment_intent_id, stripe_charge_id, appointment_id,
        trainer_id, studio_id, client_id, amount, payment_date,
        payment_method, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, 'stripe', $8, NOW())
      RETURNING id
    `;
    
    const values = [
      paymentData.stripePaymentIntentId,
      paymentData.stripeChargeId,
      paymentData.appointmentId,
      paymentData.trainerId,
      paymentData.studioId,
      paymentData.clientId,
      paymentData.amount,
      paymentData.status
    ];
    
    const result = await this.query(query, values);
    return result.rows[0].id;
  }

  async updateAppointmentPaymentStatus(appointmentId, clientId, status) {
    const query = `
      UPDATE appointment_participants 
      SET payment_status = $1 
      WHERE appointment_id = $2 AND client_id = $3
    `;
    await this.query(query, [status, appointmentId, clientId]);
  }

  async createClientPackageSubscription(data) {
    const query = `
      INSERT INTO client_packages (
        client_id, package_id, trainer_id, stripe_subscription_id,
        purchase_date, expiry_date, sessions_remaining, status
      ) VALUES ($1, $2, $3, $4, CURRENT_DATE, 
        CURRENT_DATE + INTERVAL '1 month', 
        (SELECT sessions_count FROM payment_packages WHERE id = $2),
        'active')
      RETURNING id
    `;
    
    const values = [
      data.clientId,
      data.packageId,
      data.trainerId,
      data.stripeSubscriptionId
    ];
    
    const result = await this.query(query, values);
    return result.rows[0].id;
  }

  async updateClientPackageStatus(subscriptionId, status) {
    const query = `
      UPDATE client_packages 
      SET status = $1, updated_at = NOW() 
      WHERE stripe_subscription_id = $2
    `;
    await this.query(query, [status, subscriptionId]);
  }

  async activateClientPackage(data) {
    const packageResult = await this.getPackage(data.packageId);
    const validityDays = packageResult.validity_days || 30;
    
    const query = `
      INSERT INTO client_packages (
        client_id, package_id, trainer_id, payment_id,
        purchase_date, expiry_date, sessions_remaining, status
      ) VALUES ($1, $2, $3, 
        (SELECT id FROM payments WHERE stripe_payment_intent_id = $4),
        CURRENT_DATE, 
        CURRENT_DATE + INTERVAL '${validityDays} days',
        $5, 'active')
      RETURNING id
    `;
    
    const values = [
      data.clientId,
      data.packageId,
      data.trainerId || packageResult.trainer_id,
      data.paymentIntentId,
      packageResult.sessions_count
    ];
    
    const result = await this.query(query, values);
    return result.rows[0].id;
  }

  async updatePaymentRefund(data) {
    const query = `
      UPDATE payments 
      SET stripe_refund_id = $1, refund_amount = $2, 
          refund_reason = $3, status = 'refunded' 
      WHERE stripe_payment_intent_id = $4
    `;
    
    const values = [
      data.refundId,
      data.refundAmount,
      data.refundReason,
      data.paymentIntentId
    ];
    
    await this.query(query, values);
  }

  async saveClientPaymentMethod(data) {
    const query = `
      INSERT INTO client_payment_methods (
        client_id, stripe_payment_method_id, type, brand,
        last4, exp_month, exp_year, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (client_id, stripe_payment_method_id) 
      DO UPDATE SET 
        brand = EXCLUDED.brand,
        last4 = EXCLUDED.last4,
        exp_month = EXCLUDED.exp_month,
        exp_year = EXCLUDED.exp_year
    `;
    
    const values = [
      data.clientId,
      data.stripePaymentMethodId,
      data.type,
      data.brand,
      data.last4,
      data.expMonth,
      data.expYear,
      false
    ];
    
    await this.query(query, values);
  }

  async deleteClientPaymentMethod(paymentMethodId, clientId) {
    const query = `
      DELETE FROM client_payment_methods 
      WHERE stripe_payment_method_id = $1 AND client_id = $2
    `;
    await this.query(query, [paymentMethodId, clientId]);
  }

  async updatePackageStripePriceId(packageId, stripePriceId) {
    const query = `
      UPDATE payment_packages 
      SET stripe_price_id = $1, updated_at = NOW() 
      WHERE id = $2
    `;
    await this.query(query, [stripePriceId, packageId]);
  }

  async updateSubscriptionStatus(data) {
    const query = `
      UPDATE client_packages 
      SET status = $1, expiry_date = $2, updated_at = NOW() 
      WHERE stripe_subscription_id = $3
    `;
    
    const values = [
      data.status === 'active' ? 'active' : 'cancelled',
      data.currentPeriodEnd,
      data.stripeSubscriptionId
    ];
    
    await this.query(query, values);
  }

  async cancelClientPackageSubscription(subscriptionId) {
    const query = `
      UPDATE client_packages 
      SET status = 'cancelled', updated_at = NOW() 
      WHERE stripe_subscription_id = $1
    `;
    await this.query(query, [subscriptionId]);
  }

  async recordSubscriptionPayment(data) {
    const query = `
      INSERT INTO payments (
        client_id, trainer_id, amount, payment_date,
        payment_method, stripe_payment_intent_id, status
      ) 
      SELECT cp.client_id, cp.trainer_id, $1, CURRENT_DATE, 
             'stripe', $2, 'completed'
      FROM client_packages cp
      WHERE cp.stripe_subscription_id = $3
    `;
    
    const values = [
      data.amount,
      data.invoiceId,
      data.subscriptionId
    ];
    
    await this.query(query, values);
  }
}

module.exports = new Database();