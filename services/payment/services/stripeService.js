const { stripe, STRIPE_CONFIG } = require('../config/stripe');
const logger = require('../utils/logger');
const db = require('../utils/database');

class StripeService {
  /**
   * Create or retrieve a Stripe customer for a client
   */
  async createOrGetCustomer(client) {
    try {
      // Check if customer already exists in Stripe
      if (client.stripe_customer_id) {
        const customer = await stripe.customers.retrieve(client.stripe_customer_id);
        if (!customer.deleted) {
          return customer;
        }
      }

      // Create new customer
      const customer = await stripe.customers.create({
        email: client.email,
        name: `${client.first_name} ${client.last_name}`,
        phone: client.phone,
        metadata: {
          client_id: client.id,
          created_by: 'fitflow_payment_service'
        }
      });

      // Update client record with Stripe customer ID
      await db.query(
        'UPDATE clients SET stripe_customer_id = $1 WHERE id = $2',
        [customer.id, client.id]
      );

      logger.info(`Created Stripe customer ${customer.id} for client ${client.id}`);
      return customer;
    } catch (error) {
      logger.error('Error creating Stripe customer:', error);
      throw error;
    }
  }

  /**
   * Create a payment intent for a single session
   */
  async createPaymentIntent({ amount, clientId, appointmentId, trainerId, studioId }) {
    try {
      const client = await db.getClient(clientId);
      const customer = await this.createOrGetCustomer(client);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: STRIPE_CONFIG.currency,
        customer: customer.id,
        payment_method_types: STRIPE_CONFIG.paymentMethods,
        metadata: {
          [STRIPE_CONFIG.metadata.appointmentId]: appointmentId,
          [STRIPE_CONFIG.metadata.clientId]: clientId,
          [STRIPE_CONFIG.metadata.trainerId]: trainerId,
          [STRIPE_CONFIG.metadata.studioId]: studioId || ''
        },
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never'
        }
      });

      logger.info(`Created payment intent ${paymentIntent.id} for appointment ${appointmentId}`);
      return paymentIntent;
    } catch (error) {
      logger.error('Error creating payment intent:', error);
      throw error;
    }
  }

  /**
   * Create a payment intent for a package purchase
   */
  async createPackagePaymentIntent({ packageId, clientId, trainerId }) {
    try {
      const package = await db.getPackage(packageId);
      const client = await db.getClient(clientId);
      const customer = await this.createOrGetCustomer(client);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(package.price * 100),
        currency: STRIPE_CONFIG.currency,
        customer: customer.id,
        payment_method_types: STRIPE_CONFIG.paymentMethods,
        metadata: {
          [STRIPE_CONFIG.metadata.packageId]: packageId,
          [STRIPE_CONFIG.metadata.clientId]: clientId,
          [STRIPE_CONFIG.metadata.trainerId]: trainerId,
          package_type: package.package_type,
          sessions_count: package.sessions_count || 'unlimited'
        }
      });

      logger.info(`Created package payment intent ${paymentIntent.id} for package ${packageId}`);
      return paymentIntent;
    } catch (error) {
      logger.error('Error creating package payment intent:', error);
      throw error;
    }
  }

  /**
   * Create a subscription for recurring packages
   */
  async createSubscription({ packageId, clientId, trainerId, paymentMethodId }) {
    try {
      const package = await db.getPackage(packageId);
      if (!package.is_recurring || !package.stripe_price_id) {
        throw new Error('Package is not set up for recurring payments');
      }

      const client = await db.getClient(clientId);
      const customer = await this.createOrGetCustomer(client);

      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id
      });

      // Set as default payment method
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: package.stripe_price_id }],
        metadata: {
          [STRIPE_CONFIG.metadata.packageId]: packageId,
          [STRIPE_CONFIG.metadata.clientId]: clientId,
          [STRIPE_CONFIG.metadata.trainerId]: trainerId
        },
        trial_period_days: STRIPE_CONFIG.subscription.trialPeriodDays,
        cancel_at_period_end: STRIPE_CONFIG.subscription.cancelAtPeriodEnd
      });

      // Save subscription to database
      await db.createClientPackageSubscription({
        clientId,
        packageId,
        trainerId,
        stripeSubscriptionId: subscription.id
      });

      logger.info(`Created subscription ${subscription.id} for client ${clientId}`);
      return subscription;
    } catch (error) {
      logger.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId, immediately = false) {
    try {
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: !immediately
      });

      if (immediately) {
        await stripe.subscriptions.cancel(subscriptionId);
      }

      // Update database
      await db.updateClientPackageStatus(subscriptionId, 'cancelled');

      logger.info(`Cancelled subscription ${subscriptionId}`);
      return subscription;
    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Process refund
   */
  async createRefund({ paymentIntentId, amount, reason }) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined, // Partial refund if amount specified
        reason: reason || 'requested_by_customer',
        metadata: {
          refunded_by: 'fitflow_payment_service',
          refund_date: new Date().toISOString()
        }
      });

      // Update payment record
      await db.updatePaymentRefund({
        paymentIntentId,
        refundId: refund.id,
        refundAmount: refund.amount / 100,
        refundReason: reason
      });

      logger.info(`Created refund ${refund.id} for payment intent ${paymentIntentId}`);
      return refund;
    } catch (error) {
      logger.error('Error creating refund:', error);
      throw error;
    }
  }

  /**
   * Save payment method for future use
   */
  async savePaymentMethod(paymentMethodId, clientId) {
    try {
      const client = await db.getClient(clientId);
      const customer = await this.createOrGetCustomer(client);

      // Attach payment method to customer
      const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id
      });

      // Save to database
      await db.saveClientPaymentMethod({
        clientId,
        stripePaymentMethodId: paymentMethod.id,
        type: paymentMethod.type,
        brand: paymentMethod.card?.brand,
        last4: paymentMethod.card?.last4,
        expMonth: paymentMethod.card?.exp_month,
        expYear: paymentMethod.card?.exp_year
      });

      logger.info(`Saved payment method ${paymentMethod.id} for client ${clientId}`);
      return paymentMethod;
    } catch (error) {
      logger.error('Error saving payment method:', error);
      throw error;
    }
  }

  /**
   * List client's saved payment methods
   */
  async listPaymentMethods(clientId) {
    try {
      const client = await db.getClient(clientId);
      if (!client.stripe_customer_id) {
        return [];
      }

      const paymentMethods = await stripe.paymentMethods.list({
        customer: client.stripe_customer_id,
        type: 'card'
      });

      return paymentMethods.data;
    } catch (error) {
      logger.error('Error listing payment methods:', error);
      throw error;
    }
  }

  /**
   * Delete a payment method
   */
  async deletePaymentMethod(paymentMethodId, clientId) {
    try {
      await stripe.paymentMethods.detach(paymentMethodId);
      await db.deleteClientPaymentMethod(paymentMethodId, clientId);

      logger.info(`Deleted payment method ${paymentMethodId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error deleting payment method:', error);
      throw error;
    }
  }

  /**
   * Create a price for a package (for subscriptions)
   */
  async createPrice(package) {
    try {
      const price = await stripe.prices.create({
        currency: STRIPE_CONFIG.currency,
        unit_amount: Math.round(package.price * 100),
        recurring: {
          interval: 'month',
          interval_count: 1
        },
        product_data: {
          name: package.name,
          metadata: {
            package_id: package.id,
            trainer_id: package.trainer_id
          }
        }
      });

      // Update package with Stripe price ID
      await db.updatePackageStripePriceId(package.id, price.id);

      logger.info(`Created Stripe price ${price.id} for package ${package.id}`);
      return price;
    } catch (error) {
      logger.error('Error creating price:', error);
      throw error;
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(event) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object);
          break;
        
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object);
          break;
        
        case 'subscription.created':
        case 'subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object);
          break;
        
        case 'subscription.deleted':
          await this.handleSubscriptionCancellation(event.data.object);
          break;
        
        case 'invoice.payment_succeeded':
          await this.handleInvoicePayment(event.data.object);
          break;
        
        default:
          logger.info(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error) {
      logger.error('Error handling webhook:', error);
      throw error;
    }
  }

  /**
   * Handle successful payment
   */
  async handlePaymentSuccess(paymentIntent) {
    const metadata = paymentIntent.metadata;
    
    // Record payment in database
    await db.recordPayment({
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: paymentIntent.latest_charge,
      appointmentId: metadata[STRIPE_CONFIG.metadata.appointmentId],
      clientId: metadata[STRIPE_CONFIG.metadata.clientId],
      trainerId: metadata[STRIPE_CONFIG.metadata.trainerId],
      studioId: metadata[STRIPE_CONFIG.metadata.studioId],
      amount: paymentIntent.amount / 100,
      status: 'completed'
    });

    // Update appointment payment status if applicable
    if (metadata[STRIPE_CONFIG.metadata.appointmentId]) {
      await db.updateAppointmentPaymentStatus(
        metadata[STRIPE_CONFIG.metadata.appointmentId],
        metadata[STRIPE_CONFIG.metadata.clientId],
        'paid'
      );
    }

    // Handle package purchase
    if (metadata[STRIPE_CONFIG.metadata.packageId]) {
      await db.activateClientPackage({
        clientId: metadata[STRIPE_CONFIG.metadata.clientId],
        packageId: metadata[STRIPE_CONFIG.metadata.packageId],
        paymentIntentId: paymentIntent.id
      });
    }
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailure(paymentIntent) {
    const metadata = paymentIntent.metadata;
    
    await db.recordPayment({
      stripePaymentIntentId: paymentIntent.id,
      appointmentId: metadata[STRIPE_CONFIG.metadata.appointmentId],
      clientId: metadata[STRIPE_CONFIG.metadata.clientId],
      trainerId: metadata[STRIPE_CONFIG.metadata.trainerId],
      amount: paymentIntent.amount / 100,
      status: 'failed'
    });
  }

  /**
   * Handle subscription updates
   */
  async handleSubscriptionUpdate(subscription) {
    await db.updateSubscriptionStatus({
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    });
  }

  /**
   * Handle subscription cancellation
   */
  async handleSubscriptionCancellation(subscription) {
    await db.cancelClientPackageSubscription(subscription.id);
  }

  /**
   * Handle invoice payment (for subscriptions)
   */
  async handleInvoicePayment(invoice) {
    if (invoice.subscription) {
      await db.recordSubscriptionPayment({
        subscriptionId: invoice.subscription,
        invoiceId: invoice.id,
        amount: invoice.amount_paid / 100,
        clientId: invoice.metadata[STRIPE_CONFIG.metadata.clientId]
      });
    }
  }
}

module.exports = new StripeService();