const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');

// Payment intent routes
router.post(
  '/payment-intent',
  authenticate,
  authorize(['trainer', 'admin']),
  rateLimiter,
  paymentController.createPaymentIntent
);

router.post(
  '/package-payment',
  authenticate,
  authorize(['trainer', 'admin', 'client']),
  rateLimiter,
  paymentController.createPackagePayment
);

// Subscription routes
router.post(
  '/subscription',
  authenticate,
  authorize(['trainer', 'admin', 'client']),
  rateLimiter,
  paymentController.createSubscription
);

router.put(
  '/subscription/:subscriptionId/cancel',
  authenticate,
  authorize(['trainer', 'admin', 'client']),
  paymentController.cancelSubscription
);

// Refund routes
router.post(
  '/refund',
  authenticate,
  authorize(['trainer', 'admin']),
  rateLimiter,
  paymentController.createRefund
);

// Payment method routes
router.post(
  '/payment-method',
  authenticate,
  authorize(['client']),
  rateLimiter,
  paymentController.savePaymentMethod
);

router.get(
  '/payment-methods/:clientId',
  authenticate,
  authorize(['client', 'trainer', 'admin']),
  paymentController.listPaymentMethods
);

router.delete(
  '/payment-method/:paymentMethodId',
  authenticate,
  authorize(['client']),
  paymentController.deletePaymentMethod
);

// Payment history
router.get(
  '/history/:clientId',
  authenticate,
  authorize(['client', 'trainer', 'admin']),
  paymentController.getPaymentHistory
);

router.get(
  '/payment/:paymentId',
  authenticate,
  authorize(['client', 'trainer', 'admin']),
  paymentController.getPaymentDetails
);

// Stripe webhook endpoint (no auth required)
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.handleWebhook
);

module.exports = router;