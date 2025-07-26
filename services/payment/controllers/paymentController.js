const stripeService = require('../services/stripeService');
const { stripe } = require('../config/stripe');
const logger = require('../utils/logger');
const { validatePaymentIntent, validateRefund } = require('../utils/validators');

class PaymentController {
  /**
   * Create payment intent for appointment
   */
  async createPaymentIntent(req, res) {
    try {
      const { error } = validatePaymentIntent(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { amount, appointmentId, clientId, trainerId, studioId } = req.body;

      const paymentIntent = await stripeService.createPaymentIntent({
        amount,
        appointmentId,
        clientId,
        trainerId,
        studioId
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100
      });
    } catch (error) {
      logger.error('Error creating payment intent:', error);
      res.status(500).json({ error: 'Failed to create payment intent' });
    }
  }

  /**
   * Create payment intent for package purchase
   */
  async createPackagePayment(req, res) {
    try {
      const { packageId, clientId, trainerId } = req.body;

      const paymentIntent = await stripeService.createPackagePaymentIntent({
        packageId,
        clientId,
        trainerId
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100
      });
    } catch (error) {
      logger.error('Error creating package payment:', error);
      res.status(500).json({ error: 'Failed to create package payment' });
    }
  }

  /**
   * Create subscription for recurring package
   */
  async createSubscription(req, res) {
    try {
      const { packageId, clientId, trainerId, paymentMethodId } = req.body;

      const subscription = await stripeService.createSubscription({
        packageId,
        clientId,
        trainerId,
        paymentMethodId
      });

      res.json({
        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end
      });
    } catch (error) {
      logger.error('Error creating subscription:', error);
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(req, res) {
    try {
      const { subscriptionId } = req.params;
      const { immediately } = req.body;

      const subscription = await stripeService.cancelSubscription(
        subscriptionId,
        immediately
      );

      res.json({
        subscriptionId: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      });
    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  }

  /**
   * Process refund
   */
  async createRefund(req, res) {
    try {
      const { error } = validateRefund(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { paymentIntentId, amount, reason } = req.body;

      const refund = await stripeService.createRefund({
        paymentIntentId,
        amount,
        reason
      });

      res.json({
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status
      });
    } catch (error) {
      logger.error('Error creating refund:', error);
      res.status(500).json({ error: 'Failed to create refund' });
    }
  }

  /**
   * Save payment method
   */
  async savePaymentMethod(req, res) {
    try {
      const { paymentMethodId, clientId } = req.body;

      const paymentMethod = await stripeService.savePaymentMethod(
        paymentMethodId,
        clientId
      );

      res.json({
        paymentMethodId: paymentMethod.id,
        type: paymentMethod.type,
        card: paymentMethod.card
      });
    } catch (error) {
      logger.error('Error saving payment method:', error);
      res.status(500).json({ error: 'Failed to save payment method' });
    }
  }

  /**
   * List saved payment methods
   */
  async listPaymentMethods(req, res) {
    try {
      const { clientId } = req.params;

      const paymentMethods = await stripeService.listPaymentMethods(clientId);

      res.json({
        paymentMethods: paymentMethods.map(pm => ({
          id: pm.id,
          type: pm.type,
          card: {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year
          }
        }))
      });
    } catch (error) {
      logger.error('Error listing payment methods:', error);
      res.status(500).json({ error: 'Failed to list payment methods' });
    }
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(req, res) {
    try {
      const { paymentMethodId } = req.params;
      const { clientId } = req.body;

      await stripeService.deletePaymentMethod(paymentMethodId, clientId);

      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting payment method:', error);
      res.status(500).json({ error: 'Failed to delete payment method' });
    }
  }

  /**
   * Handle Stripe webhooks
   */
  async handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      logger.error('Webhook signature verification failed:', err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      await stripeService.handleWebhook(event);
      res.json({ received: true });
    } catch (error) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Get payment history for client
   */
  async getPaymentHistory(req, res) {
    try {
      const { clientId } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const payments = await stripeService.getPaymentHistory(clientId, limit, offset);

      res.json({
        payments,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      logger.error('Error fetching payment history:', error);
      res.status(500).json({ error: 'Failed to fetch payment history' });
    }
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(req, res) {
    try {
      const { paymentId } = req.params;

      const payment = await stripeService.getPaymentDetails(paymentId);

      res.json(payment);
    } catch (error) {
      logger.error('Error fetching payment details:', error);
      res.status(500).json({ error: 'Failed to fetch payment details' });
    }
  }
}

module.exports = new PaymentController();