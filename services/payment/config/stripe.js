const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  typescript: false,
  maxNetworkRetries: 3,
  timeout: 30000
});

const STRIPE_CONFIG = {
  webhookEndpointSecret: process.env.STRIPE_WEBHOOK_SECRET,
  currency: process.env.STRIPE_CURRENCY || 'cad',
  paymentMethods: ['card'],
  
  // Payment intent metadata keys
  metadata: {
    appointmentId: 'appointment_id',
    clientId: 'client_id',
    trainerId: 'trainer_id',
    studioId: 'studio_id',
    packageId: 'package_id'
  },
  
  // Subscription settings
  subscription: {
    cancelAtPeriodEnd: true,
    trialPeriodDays: process.env.STRIPE_TRIAL_DAYS || 0
  },
  
  // Fee structure
  applicationFeePercent: parseFloat(process.env.STRIPE_APPLICATION_FEE_PERCENT || '2.9'),
  
  // Canadian tax settings
  tax: {
    automatic: true,
    defaultTaxRates: process.env.STRIPE_DEFAULT_TAX_RATES?.split(',') || []
  }
};

module.exports = {
  stripe,
  STRIPE_CONFIG
};